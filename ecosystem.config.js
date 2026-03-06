// PM2 生态系统配置文件
// 用于在服务器上管理自动化测试平台的进程
// 文档：https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      // ─── 应用基础配置 ─────────────────────────────────────────
      name: 'autotest-platform',
      // 生产模式：运行编译后的 JS 文件（tsconfig.server.json outDir=dist/server）
      script: 'node',
      args: '-r tsconfig-paths/register dist/server/index.js',
      cwd: '/www/wwwroot/autotest.wiac.xyz',

      // ─── 运行模式 ─────────────────────────────────────────────
      // cluster 模式利用多核 CPU，fork 模式更简单稳定
      // 生产推荐 cluster，单核服务器用 fork
      exec_mode: 'fork',
      instances: 1,

      // ─── 环境变量 ─────────────────────────────────────────────
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // 告知 tsconfig-paths 使用后端专属配置（路径别名解析）
        TS_NODE_PROJECT: 'tsconfig.server.json',
      },

      // ─── 日志配置 ─────────────────────────────────────────────
      output: '/www/wwwroot/autotest.wiac.xyz/logs/pm2-out.log',
      error: '/www/wwwroot/autotest.wiac.xyz/logs/pm2-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // 日志单文件最大 50MB，超出自动轮转
      max_size: '50M',
      // 保留最近 10 个日志文件
      retain: 10,
      compress: true,

      // ─── 自动重启策略 ─────────────────────────────────────────
      // 崩溃后自动重启
      autorestart: true,
      // 最大内存限制（超出后自动重启）
      max_memory_restart: '512M',
      // 两次重启之间的最小间隔（毫秒）
      min_uptime: '10s',
      // 最大重启次数（防止启动错误导致无限重启）
      max_restarts: 10,

      // ─── 优雅重启（零停机热部署）─────────────────────────────
      // 等待旧进程处理完当前请求后再终止（毫秒）
      kill_timeout: 5000,
      // 新进程就绪后才停止旧进程（需配合 process.send('ready')）
      wait_ready: false,
      // 监听信号：SIGINT 触发优雅关闭（server/index.ts 中已处理）
      listen_timeout: 8000,

      // ─── 文件监听（仅开发环境使用，生产环境关闭）────────────
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist', '.git'],
    },
  ],
};
