import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { testConnection } from './config/database.js';
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

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 初始化 MariaDB
console.log('Connecting to MariaDB...');
testConnection().then(async (connected) => {
  if (connected) {
    console.log('MariaDB connected successfully');
  } else {
    console.error('MariaDB connection failed!');
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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// 启动服务器（支持端口重试）
function startServer(port: number, attempt: number = 1): void {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`API available at http://localhost:${port}/api`);

    // 启动定时任务调度器
    schedulerService.start();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      if (attempt < MAX_PORT_ATTEMPTS) {
        const nextPort = BASE_PORT + attempt;
        console.log(`Port ${port} is in use, trying port ${nextPort}...`);
        startServer(nextPort, attempt + 1);
      } else {
        console.error(`Failed to find available port after ${MAX_PORT_ATTEMPTS} attempts`);
        process.exit(1);
      }
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

startServer(BASE_PORT);

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

export default app;