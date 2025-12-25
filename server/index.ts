import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/index.js';
import { testConnection, initMariaDBTables } from './config/database.js';
import dashboardRoutes from './routes/dashboard.js';
import executionRoutes from './routes/executions.js';
import casesRoutes from './routes/cases.js';
import tasksRoutes from './routes/tasks.js';
import jenkinsRoutes from './routes/jenkins.js';
import authRoutes from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 初始化数据库
console.log('Initializing SQLite database...');
initDatabase();

// 初始化 MariaDB（用于认证）
console.log('Connecting to MariaDB...');
testConnection().then(async (connected) => {
  if (connected) {
    console.log('MariaDB connected successfully');
    await initMariaDBTables();
  } else {
    console.warn('MariaDB connection failed, auth features may not work');
  }
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/jenkins', jenkinsRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

export default app;
