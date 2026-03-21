module.exports = {
  apps: [
    {
      name: 'autotest-platform',
      script: './dist/server/server/index.js',
      cwd: '/opt/Automation_Platform',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
      },
      // 日志配置
      out_file: '/root/.pm2/logs/autotest-platform-out.log',
      error_file: '/root/.pm2/logs/autotest-platform-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // 崩溃自动重启
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
