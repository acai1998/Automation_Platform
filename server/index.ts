import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
 * 检查并回填过去90天的汇总数据
 */
async function initializeDailySummaryData(): Promise<void> {
  try {
    logger.info('Initializing daily summary data...', {}, LOG_CONTEXTS.DATABASE);

    // 启动每日汇总调度器
    dailySummaryScheduler.start();

    // 检查是否需要历史数据回填
    const shouldBackfill = process.env.ENABLE_DAILY_SUMMARY_BACKFILL !== 'false';

    if (shouldBackfill) {
      logger.info('Starting historical daily summary backfill (90 days)...', {}, LOG_CONTEXTS.DATABASE);

      // 异步执行历史数据回填，不阻塞服务器启动
      setImmediate(async () => {
        try {
          const result = await dailySummaryScheduler.backfillHistoricalSummaries(90);

          logger.info('Historical daily summary backfill completed', {
            totalDays: result.totalDays,
            successCount: result.successCount,
            failedCount: result.failedCount,
            errorCount: result.errors.length,
          }, LOG_CONTEXTS.DATABASE);

          if (result.errors.length > 0) {
            logger.warn('Some historical summaries failed to generate', {
              failedDates: result.errors.map(e => e.date),
              sampleErrors: result.errors.slice(0, 3).map(e => ({ date: e.date, error: e.error })),
            }, LOG_CONTEXTS.DATABASE);
          }

        } catch (error) {
          logger.errorLog(error, 'Historical daily summary backfill failed', {});
        }
      });
    } else {
      logger.info('Daily summary backfill disabled by configuration', {}, LOG_CONTEXTS.DATABASE);
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

// 错误处理中间件 (在所有路由之后)
app.use(errorLoggingMiddleware);

// 启动服务器（支持端口重试）
function startServer(port: number, attempt: number = 1): void {
  const server = app.listen(port, () => {
    logger.info(`Server started successfully`, {
      port,
      url: `http://localhost:${port}`,
      apiUrl: `http://localhost:${port}/api`,
      environment: process.env.NODE_ENV || 'development',
      attempt,
    }, LOG_CONTEXTS.HTTP);

    // 启动定时任务调度器
    schedulerService.start();
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
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...', {
    signal: 'SIGINT',
    uptime: process.uptime(),
  }, LOG_CONTEXTS.HTTP);
  schedulerService.stop();
  dailySummaryScheduler.stop();
  process.exit(0);
});

export default app;
