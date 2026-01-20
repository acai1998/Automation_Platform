import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { testConnection, initializeDataSource } from './config/database.js';
import { initializeLogging, LOG_CONTEXTS } from './config/logging.js';
import { requestLoggingMiddleware, errorLoggingMiddleware } from './middleware/RequestLoggingMiddleware.js';
import logger from './utils/logger.js';
import dashboardRoutes from './routes/dashboard.js';
import executionRoutes from './routes/executions.js';
import casesRoutes from './routes/cases.js';
import tasksRoutes from './routes/tasks.js';
import jenkinsRoutes from './routes/jenkins.js';
import authRoutes from './routes/auth.js';
import repositoriesRoutes from './routes/repositories.js';
import { schedulerService } from './services/SchedulerService.js';

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
    } catch (err) {
      logger.errorLog(err, LOG_CONTEXTS.DATABASE, { message: 'TypeORM DataSource initialization failed' });
      process.exit(1);
    }
  } else {
    logger.error('MariaDB connection failed!', {}, LOG_CONTEXTS.DATABASE);
    process.exit(1);
  }
});

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
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...', {
    signal: 'SIGINT',
    uptime: process.uptime(),
  }, LOG_CONTEXTS.HTTP);
  schedulerService.stop();
  process.exit(0);
});

export default app;
