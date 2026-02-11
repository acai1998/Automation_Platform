import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { testConnection, initializeDataSource } from './config/database';
import { initializeLogging, LOG_CONTEXTS } from './config/logging';
import { requestLoggingMiddleware, errorLoggingMiddleware } from './middleware/RequestLoggingMiddleware';
import logger from './utils/logger';
import dashboardRoutes from './routes/dashboard';
import executionRoutes from './routes/executions';
import casesRoutes from './routes/cases';
import tasksRoutes from './routes/tasks';
import jenkinsRoutes from './routes/jenkins';
import authRoutes from './routes/auth';
import repositoriesRoutes from './routes/repositories';
import { schedulerService } from './services/SchedulerService';
import { dailySummaryScheduler } from './services/DailySummaryScheduler';
import { executionMonitorService } from './services/ExecutionMonitorService';
import { initializeWebSocketService, webSocketService } from './services/WebSocketService';

const app = express();
const BASE_PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_PORT_ATTEMPTS = 10;

// 初始化日志系统
initializeLogging();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 请求日志中间件 (在所有路由之前)
app.use(requestLoggingMiddleware);

// 初始化 MariaDB
logger.info('Initializing MariaDB connection...', {}, LOG_CONTEXTS.DATABASE);
testConnection().then(async (connected) => {
  if (connected) {
    logger.info('MariaDB connected successfully', {}, LOG_CONTEXTS.DATABASE);
    try {
      await initializeDataSource();

      // 初始化每日汇总数据（历史数据回填）
      await initializeDailySummaryData();

    } catch (err) {
      logger.errorLog(err, LOG_CONTEXTS.DATABASE, { message: 'TypeORM DataSource initialization failed' });
      process.exit(1);
    }
  } else {
    logger.error('MariaDB connection failed!', {}, LOG_CONTEXTS.DATABASE);
    process.exit(1);
  }
});

/**
 * 初始化每日汇总数据
 * 检查并回填过去N天的汇总数据（增量模式：仅回填缺失日期）
 */
async function initializeDailySummaryData(): Promise<void> {
  try {
    logger.info('Initializing daily summary data...', {}, LOG_CONTEXTS.DATABASE);

    // 启动每日汇总调度器
    dailySummaryScheduler.start();

    // 检查是否需要历史数据回填
    const shouldBackfill = process.env.ENABLE_DAILY_SUMMARY_BACKFILL !== 'false';
    const backfillDays = parseInt(process.env.DAILY_SUMMARY_BACKFILL_DAYS || '90', 10);

    if (shouldBackfill) {
      logger.info('Starting historical daily summary backfill (incremental mode)', {
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
              failedDates: result.errors.map(e => e.date),
              sampleErrors: result.errors.slice(0, 3).map(e => ({ date: e.date, error: e.error })),
            }, LOG_CONTEXTS.DATABASE);
          }

        } catch (error) {
          logger.errorLog(error, 'Historical daily summary backfill failed', {
            backfillDays,
          });
        }
      });
    } else {
      logger.info('Daily summary backfill disabled by configuration', {
        enableFlag: 'ENABLE_DAILY_SUMMARY_BACKFILL',
      }, LOG_CONTEXTS.DATABASE);
    }

  } catch (error) {
    logger.errorLog(error, 'Failed to initialize daily summary data', {});
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
app.use('/api/repositories', repositoriesRoutes);

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
const distPath = path.join(__dirname, '../');
logger.info('Setting up static file serving', { distPath }, LOG_CONTEXTS.HTTP);
app.use(express.static(distPath));

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
      port,
      url: `http://localhost:${port}`,
      apiUrl: `http://localhost:${port}/api`,
      wsUrl: `ws://localhost:${port}/api/ws`,
      environment: process.env.NODE_ENV || 'development',
      attempt,
      webSocketEnabled: process.env.WEBSOCKET_ENABLED !== 'false'
    }, LOG_CONTEXTS.HTTP);

    // 启动定时任务调度器
    schedulerService.start();

    // 启动执行监控服务
    executionMonitorService.start();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      if (attempt < MAX_PORT_ATTEMPTS) {
        const nextPort = BASE_PORT + attempt;
        logger.warn(`Port ${port} is in use, trying port ${nextPort}...`, {
          currentPort: port,
          nextPort,
          attempt,
          maxAttempts: MAX_PORT_ATTEMPTS,
        }, LOG_CONTEXTS.HTTP);
        startServer(nextPort, attempt + 1);
      } else {
        logger.error(`Failed to find available port after ${MAX_PORT_ATTEMPTS} attempts`, {
          basePort: BASE_PORT,
          maxAttempts: MAX_PORT_ATTEMPTS,
          lastAttemptPort: port,
        }, LOG_CONTEXTS.HTTP);
        process.exit(1);
      }
    } else {
      logger.errorLog(err, 'Server startup error', {
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
    signal: 'SIGTERM',
    uptime: process.uptime(),
  }, LOG_CONTEXTS.HTTP);
  schedulerService.stop();
  dailySummaryScheduler.stop();
  executionMonitorService.stop();
  webSocketService?.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...', {
    signal: 'SIGINT',
    uptime: process.uptime(),
  }, LOG_CONTEXTS.HTTP);
  schedulerService.stop();
  dailySummaryScheduler.stop();
  executionMonitorService.stop();
  webSocketService?.close();
  process.exit(0);
});

export default app;
