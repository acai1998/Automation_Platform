import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { testConnection, initializeDataSource } from './config/database';
import { initializeLogging, LOG_CONTEXTS, LOG_EVENTS } from './config/logging';
import { requestLoggingMiddleware, errorLoggingMiddleware } from './middleware/RequestLoggingMiddleware';
import logger from './utils/logger';
import dashboardRoutes from './routes/dashboard';
import executionRoutes from './routes/executions';
import casesRoutes from './routes/cases';
import tasksRoutes from './routes/tasks';
import jenkinsRoutes from './routes/jenkins';
import authRoutes from './routes/auth';
import aiCasesRoutes from './routes/aiCases';
import { dailySummaryScheduler } from './services/DailySummaryScheduler';
import { executionMonitorService } from './services/ExecutionMonitorService';
import { initializeWebSocketService, webSocketService } from './services/WebSocketService';
import { taskSchedulerService } from './services/TaskSchedulerService';
import { ExecutionRepository } from './repositories/ExecutionRepository';
import { AppDataSource } from './config/dataSource';
import { authenticate, requireAdmin } from './middleware/auth';

const app = express();

// 全局 executionRepository 实例（在 DataSource 初始化后使用）
let executionRepository: ExecutionRepository | null = null;
const BASE_PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_PORT_ATTEMPTS = 10;

// 初始化日志系统
initializeLogging();

// 信任反向代理（Nginx），使 express-rate-limit 能正确识别客户端真实 IP
// 1 表示信任第一层代理（即 Nginx）
app.set('trust proxy', 1);

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 请求日志中间件 (在所有路由之前)
app.use(requestLoggingMiddleware);

// 初始化 MariaDB
logger.info('Initializing MariaDB connection...', { event: LOG_EVENTS.SERVER_DB_INIT_STARTED }, LOG_CONTEXTS.DATABASE);
testConnection().then(async (connected) => {
  if (connected) {
    logger.info('MariaDB connected successfully', { event: LOG_EVENTS.SERVER_DB_INIT_COMPLETED }, LOG_CONTEXTS.DATABASE);
    try {
      await initializeDataSource();

      // 初始化 ExecutionRepository 实例
      executionRepository = new ExecutionRepository(AppDataSource);

      // 初始化每日汇总数据（历史数据回填）
      await initializeDailySummaryData();

    } catch (err) {
      logger.errorLog(err, 'TypeORM DataSource initialization failed', { event: LOG_EVENTS.SERVER_DB_INIT_FAILED });
      process.exit(1);
    }
  } else {
    logger.error('MariaDB connection failed!', { event: LOG_EVENTS.SERVER_DB_INIT_FAILED }, LOG_CONTEXTS.DATABASE);
    process.exit(1);
  }
});

/**
 * 初始化每日汇总数据
 * 检查并回填过去N天的汇总数据（增量模式：仅回填缺失日期）
 */
async function initializeDailySummaryData(): Promise<void> {
  try {
    logger.info('Initializing daily summary data...', { event: LOG_EVENTS.SCHEDULER_STARTED }, LOG_CONTEXTS.DATABASE);

    // 启动每日汇总调度器
    dailySummaryScheduler.start();

    // 检查是否需要历史数据回填
    const shouldBackfill = process.env.ENABLE_DAILY_SUMMARY_BACKFILL !== 'false';
    const backfillDays = parseInt(process.env.DAILY_SUMMARY_BACKFILL_DAYS || '90', 10);

    if (shouldBackfill) {
      logger.info('Starting historical daily summary backfill (incremental mode)', {
        event: LOG_EVENTS.SERVER_BACKFILL_STARTED,
        days: backfillDays,
        mode: 'incremental',
      }, LOG_CONTEXTS.DATABASE);

      // 异步执行历史数据回填，不阻塞服务器启动
      setImmediate(async () => {
        const startTime = Date.now();
        try {
          // 使用增量回填模式（仅处理缺失日期），避免不必要的数据库写入
          const result = await dailySummaryScheduler.backfillHistoricalSummaries(
            backfillDays,
            true // onlyMissingDates = true
          );

          const duration = Date.now() - startTime;
          logger.info('Historical daily summary backfill completed', {
            event: LOG_EVENTS.SERVER_BACKFILL_COMPLETED,
            totalDays: result.totalDays,
            processedDays: result.successCount,
            skippedDays: result.skippedCount || 0,
            failedDays: result.failedCount,
            errorCount: result.errors.length,
            mode: result.mode,
            durationMs: duration,
          }, LOG_CONTEXTS.DATABASE);

          if (result.errors.length > 0) {
            logger.warn('Some historical summaries failed to generate', {
              event: LOG_EVENTS.SERVER_BACKFILL_PARTIAL_FAILURE,
              failedDates: result.errors.map(e => e.date),
              sampleErrors: result.errors.slice(0, 3).map(e => ({ date: e.date, error: e.error })),
            }, LOG_CONTEXTS.DATABASE);
          }

        } catch (error) {
          logger.errorLog(error, 'Historical daily summary backfill failed', {
            event: LOG_EVENTS.SERVER_BACKFILL_FAILED,
            backfillDays,
          });
        }
      });
    } else {
      logger.info('Daily summary backfill disabled by configuration', {
        event: LOG_EVENTS.SERVER_BACKFILL_DISABLED,
        enableFlag: 'ENABLE_DAILY_SUMMARY_BACKFILL',
      }, LOG_CONTEXTS.DATABASE);
    }

  } catch (error) {
    logger.errorLog(error, 'Failed to initialize daily summary data', { event: LOG_EVENTS.SERVER_DB_INIT_FAILED });
    // 不中断服务器启动，但记录错误
  }
}

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/jenkins', jenkinsRoutes);
app.use('/api/ai-cases', aiCasesRoutes);

// 【紧急修复】修复孤立的 TestRun 记录
// 安全修复：添加 authenticate 和 requireAdmin 中间件，确保只有管理员才能执行数据修复操作
app.post('/api/fix-orphaned-runs', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!executionRepository) {
      return res.status(503).json({
        success: false,
        message: 'ExecutionRepository not initialized yet',
      });
    }
    const result = await executionRepository.fixOrphanedTestRuns();
    res.json({
      success: true,
      message: '孤立 TestRun 修复完成',
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '修复失败',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// 【新增】修复特定的 TestRun，直接绑定到对应的 execution_id
// 用于处理 TestRun.execution_id 为 NULL 的情况
// 场景：如果 TestRun 的 ID 与其对应的 TaskExecution ID 相同，直接绑定
// 安全修复：添加 authenticate 和 requireAdmin 中间件，确保只有管理员才能执行数据修复操作
app.post('/api/fix-specific-run/:runId', authenticate, requireAdmin, async (req, res) => {
  // 资源泄漏修复：将 queryRunner 声明在外层，确保在任何情况下都能正确释放
  let queryRunner: ReturnType<typeof AppDataSource.createQueryRunner> | null = null;

  try {
    if (!executionRepository) {
      return res.status(503).json({
        success: false,
        message: 'ExecutionRepository not initialized yet',
      });
    }

    const runId = parseInt(req.params.runId, 10);
    if (isNaN(runId) || runId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid runId. Must be a positive integer.',
      });
    }

    const datasource = AppDataSource;
    if (!datasource.isInitialized) {
      return res.status(503).json({
        success: false,
        message: 'Database not initialized yet',
      });
    }

    queryRunner = datasource.createQueryRunner();

    // 1. 查询 TestRun 当前状态
    const testRunRows = await queryRunner.query(
      'SELECT id, execution_id, trigger_by, jenkins_build_id, created_at FROM Auto_TestRun WHERE id = ?',
      [runId]
    ) as Array<{ id: number; execution_id: number | null; trigger_by: number; jenkins_build_id: string; created_at: Date }>;

    if (!testRunRows || testRunRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `TestRun not found: runId=${runId}`,
      });
    }

    const testRun = testRunRows[0];

    // 2. 如果 execution_id 已设置，不需要修复
    if (testRun.execution_id !== null) {
      return res.status(200).json({
        success: true,
        message: 'TestRun already has correct execution_id',
        data: {
          runId: testRun.id,
          executionId: testRun.execution_id,
          status: 'already_linked',
        },
      });
    }

    // 3. 尝试三种方法找到正确的 execution_id：
    //    a. 首先查找与相同 Jenkins build ID 的 TaskExecution
    //    b. 如果失败，检查 TaskExecution ID 是否与 TestRun ID 相同
    //    c. 如果上述都失败，使用时间窗口反查

    let correctExecutionId: number | null = null;

    // 方法 a: 通过 Jenkins build ID 匹配
    if (testRun.jenkins_build_id) {
      const jenkinsMatchRows = await queryRunner.query(
        'SELECT id FROM Auto_TestCaseTaskExecutions WHERE jenkins_build_id = ? LIMIT 1',
        [testRun.jenkins_build_id]
      ) as Array<{ id: number }>;

      if (jenkinsMatchRows && jenkinsMatchRows.length > 0) {
        correctExecutionId = jenkinsMatchRows[0].id;
        logger.info(`Found execution by Jenkins build ID: ${correctExecutionId}`, {}, LOG_CONTEXTS.REPOSITORY);
      }
    }

    // 方法 b: 检查相同 ID 的 TaskExecution 是否存在
    if (!correctExecutionId) {
      const sameIdRows = await queryRunner.query(
        'SELECT id FROM Auto_TestCaseTaskExecutions WHERE id = ? LIMIT 1',
        [runId]
      ) as Array<{ id: number }>;

      if (sameIdRows && sameIdRows.length > 0) {
        correctExecutionId = runId;
        logger.info(`Found execution with same ID as TestRun: ${correctExecutionId}`, {}, LOG_CONTEXTS.REPOSITORY);
      }
    }

    // 方法 c: 时间窗口反查
    if (!correctExecutionId) {
      const timeWindowRows = await queryRunner.query(`
        SELECT e.id
        FROM Auto_TestCaseTaskExecutions e
        WHERE e.executed_by = ?
          AND e.created_at BETWEEN DATE_SUB(?, INTERVAL 120 SECOND) AND DATE_ADD(?, INTERVAL 120 SECOND)
        ORDER BY ABS(TIMESTAMPDIFF(SECOND, e.created_at, ?)) ASC
        LIMIT 1
      `, [testRun.trigger_by, testRun.created_at, testRun.created_at, testRun.created_at]
      ) as Array<{ id: number }>;

      if (timeWindowRows && timeWindowRows.length > 0) {
        correctExecutionId = timeWindowRows[0].id;
        logger.info(`Found execution by time-window search: ${correctExecutionId}`, {}, LOG_CONTEXTS.REPOSITORY);
      }
    }

    if (!correctExecutionId) {
      return res.status(404).json({
        success: false,
        message: `Could not find matching execution for TestRun ${runId}`,
        data: {
          runId,
          searched: {
            jenkinsJobId: testRun.jenkins_build_id,
            triggeredBy: testRun.trigger_by,
            createdAt: testRun.created_at,
          },
        },
      });
    }

    // 4. 更新 TestRun 的 execution_id
    await queryRunner.query(
      'UPDATE Auto_TestRun SET execution_id = ? WHERE id = ?',
      [correctExecutionId, runId]
    );

    logger.info(`Fixed TestRun ${runId} → execution_id ${correctExecutionId}`, {}, LOG_CONTEXTS.REPOSITORY);

    return res.json({
      success: true,
      message: `Fixed TestRun ${runId}`,
      data: {
        runId,
        executionId: correctExecutionId,
        status: 'fixed',
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: '修复失败',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // 资源泄漏修复：确保在任何情况下都释放 queryRunner
    if (queryRunner) {
      await queryRunner.release();
    }
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  const healthStatus = { status: 'ok', timestamp: new Date().toISOString() };

  logger.info('Health check requested', {
    response: healthStatus,
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
  }, LOG_CONTEXTS.HTTP);

  res.json(healthStatus);
});

// 静态文件服务 - 提供前端构建文件
// 编译后路径为 dist/server/server/index.js，需上溯3层到达 dist/
const distPath = path.join(__dirname, '../../');
logger.info('Setting up static file serving', { distPath }, LOG_CONTEXTS.HTTP);
// 带哈希的静态资源（JS/CSS）可以长期缓存；index.html 本身必须禁止缓存
app.use(express.static(distPath, {
  setHeaders(res, filePath) {
    // index.html 不缓存，确保每次部署后用户加载最新版本
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// 静态文件访问速率限制 - 防止 DoS 攻击
const staticFileRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  max: 1000, // 每个IP每15分钟最多1000次请求
  message: {
    error: 'Too many requests for static files, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // 返回速率限制信息在 `RateLimit-*` 头中
  legacyHeaders: false, // 禁用 `X-RateLimit-*` 头
  // 移除自定义 keyGenerator，使用默认的 IP 处理（支持 IPv6）
  skip: (req: express.Request) => {
    // 跳过 API 路由的速率限制（API 路由有自己的限制）
    return req.path.startsWith('/api/');
  },
  handler: (req: express.Request, res: express.Response) => {
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    logger.warn('Static file rate limit exceeded', {
      ip: clientIP,
      path: req.path,
      userAgent: req.headers['user-agent'],
      windowMs: 15 * 60 * 1000,
      max: 1000
    }, LOG_CONTEXTS.SECURITY);

    res.status(429).json({
      error: 'Too many requests for static files, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// SPA fallback - 所有非 API 路由都返回 index.html（带速率限制）
app.get('*', staticFileRateLimit, (req, res) => {
  // 跳过 API 路由
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  const indexPath = path.join(distPath, 'index.html');
  logger.debug('Serving SPA index.html', { path: req.path, indexPath }, LOG_CONTEXTS.HTTP);
  // index.html 不缓存，防止部署后浏览器仍使用旧版本导致 JS 哈希不匹配
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(indexPath);
});

// 错误处理中间件 (在所有路由之后)
app.use(errorLoggingMiddleware);

// 启动服务器（支持端口重试）
function startServer(port: number, attempt: number = 1): void {
  // 创建 HTTP 服务器以支持 WebSocket
  const httpServer = createServer(app);

  // 初始化 WebSocket 服务
  initializeWebSocketService(httpServer);

  const server = httpServer.listen(port, () => {
    logger.info(`Server started successfully`, {
      event: LOG_EVENTS.SERVER_STARTED,
      port,
      url: `http://localhost:${port}`,
      apiUrl: `http://localhost:${port}/api`,
      wsUrl: `ws://localhost:${port}/api/ws`,
      environment: process.env.NODE_ENV || 'development',
      attempt,
      webSocketEnabled: process.env.WEBSOCKET_ENABLED !== 'false'
    }, LOG_CONTEXTS.HTTP);

    // 启动执行监控服务
    executionMonitorService.start();

    // 启动任务定时调度引擎（Cron 引擎，支持漏触发补偿）
    taskSchedulerService.start().catch(err => {
      logger.errorLog(err, 'TaskSchedulerService failed to start', { event: LOG_EVENTS.SCHEDULER_STARTED });
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      if (attempt < MAX_PORT_ATTEMPTS) {
        const nextPort = BASE_PORT + attempt;
        logger.warn(`Port ${port} is in use, trying port ${nextPort}...`, {
          event: LOG_EVENTS.SERVER_PORT_RETRY,
          currentPort: port,
          nextPort,
          attempt,
          maxAttempts: MAX_PORT_ATTEMPTS,
        }, LOG_CONTEXTS.HTTP);
        startServer(nextPort, attempt + 1);
      } else {
        logger.error(`Failed to find available port after ${MAX_PORT_ATTEMPTS} attempts`, {
          event: LOG_EVENTS.SERVER_PORT_EXHAUSTED,
          basePort: BASE_PORT,
          maxAttempts: MAX_PORT_ATTEMPTS,
          lastAttemptPort: port,
        }, LOG_CONTEXTS.HTTP);
        process.exit(1);
      }
    } else {
      logger.errorLog(err, 'Server startup error', {
        event: LOG_EVENTS.SERVER_STARTUP_ERROR,
        port,
        attempt,
        errorCode: err.code,
      });
      process.exit(1);
    }
  });
}

startServer(BASE_PORT);

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...', {
    event: LOG_EVENTS.SERVER_SHUTTING_DOWN,
    signal: 'SIGTERM',
    uptime: process.uptime(),
  }, LOG_CONTEXTS.HTTP);
  dailySummaryScheduler.stop();
  executionMonitorService.stop();
  taskSchedulerService.stop();
  webSocketService?.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...', {
    event: LOG_EVENTS.SERVER_SHUTTING_DOWN,
    signal: 'SIGINT',
    uptime: process.uptime(),
  }, LOG_CONTEXTS.HTTP);
  dailySummaryScheduler.stop();
  executionMonitorService.stop();
  taskSchedulerService.stop();
  webSocketService?.close();
  process.exit(0);
});

export default app;