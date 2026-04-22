# 故障排查指南

> **触发场景**：遇到 Jenkins 连接失败、执行卡住、数据库错误、Git 同步失败、数据不准确等问题时读取本文件。

---

## 1. Jenkins 连接失败

**症状**：无法触发测试执行

**排查步骤**：
1. 检查 Jenkins 服务是否运行：`curl http://localhost:3000/api/jenkins/health`
2. 验证环境变量配置：`JENKINS_URL`, `JENKINS_USERNAME`, `JENKINS_PASSWORD`
3. 检查 Jenkins Job 配置是否正确
4. 查看 Jenkins 日志确认 API Token 是否有效

---

## 2. 测试执行卡住

**症状**：执行状态一直为 `pending`

**排查步骤**：
1. 查询卡住的执行：`curl http://localhost:3000/api/executions/stuck`
2. 诊断执行问题：`curl "http://localhost:3000/api/jenkins/diagnose?runId=123"`
3. 手动同步：`curl -X POST http://localhost:3000/api/jenkins/callback/manual-sync/123`
4. 检查 Jenkins Pipeline 是否正常执行

---

## 3. 数据库连接失败

**症状**：API 返回数据库错误

**排查步骤**：
1. 检查数据库服务是否运行
2. 验证环境变量配置：`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
3. 测试数据库连接：查看 `server/config/database.ts` 配置
4. 检查数据库用户权限

---

## 4. Git 仓库同步失败

**症状**：无法同步测试脚本

**排查步骤**：
1. 测试仓库连接：`POST /api/repositories/:id/test-connection`
2. 检查 SSH 密钥或 HTTPS 认证是否配置正确
3. 查看同步日志：`GET /api/repositories/:id/sync-logs`
4. 验证仓库 URL 和分支是否正确

---

## 5. 前端页面加载缓慢

**症状**：首屏加载时间超过 3 秒

**排查步骤**：
1. 检查网络连接
2. 清理浏览器缓存
3. 检查 API 响应时间
4. 查看浏览器控制台错误
5. 优化前端代码和资源加载

---

## 6. 仪表盘数据不更新

**症状**：刷新后仍显示旧数据

**排查步骤**：
1. 检查 TanStack Query 缓存配置
2. 使用 `refetchOnMount` 和 `refetchOnWindowFocus` 强制刷新
3. 检查 API 接口是否返回最新数据
4. 清除浏览器缓存和 localStorage
5. 检查数据库查询逻辑是否正确

---

## 7. 服务器重启后 Jenkins 和自动化平台无法访问

**症状**：重启服务器后，`https://autotest.wiac.xyz` 和 `https://jenkins.wiac.xyz` 均无法访问

**根本原因**：`/etc/nginx/conf.d/` 下存在软链接 `automation-platform.conf`，指向 Docker 部署时生成的配置文件（`/opt/automation-platform/nginx/conf.d/automation-platform.conf`），该文件中 SSL 证书路径为标准 Let's Encrypt 格式（`fullchain.pem` / `privkey.pem`），但服务器上实际证书文件是腾讯云格式（`_bundle.pem` / `.key`），导致 Nginx 启动失败，两个域名的 HTTPS 代理全部挂掉。

**排查步骤**：
1. 检查 Nginx 状态：`systemctl status nginx`，确认是否因 SSL 证书加载失败而崩溃
2. 确认实际证书文件名：`ls /etc/letsencrypt/live/autotest.wiac.xyz/`
3. 找出引用了不存在证书路径的配置文件：`grep -rl "fullchain.pem" /etc/nginx/conf.d/`
4. 检查是否存在重复冲突的配置软链接：`ls -la /etc/nginx/conf.d/`

**修复方法**：删除有问题的软链接，保留正确的配置文件
```bash
rm /etc/nginx/conf.d/automation-platform.conf
nginx -t
systemctl start nginx
```

**预防措施**：
- 确保 Nginx 开机自启：`systemctl enable nginx`
- 确保 Docker 容器自动重启：`docker update --restart=unless-stopped automation-platform`
- 不要在 `/etc/nginx/conf.d/` 下创建指向 Docker 挂载目录的软链接，避免证书路径不一致问题

---

## 8. 统计数据不准确

**症状**：用例统计数量与实际不符

**排查步骤**：
1. 检查 Jenkins 回调数据格式是否正确
2. 验证 pytest 结果解析逻辑
3. 检查数据库中 passed/failed/skipped 字段值
4. 查看执行日志确认实际执行结果
5. 手动触发数据同步修复

---

## 日志查看

### 后端日志
- 日志位置：根据 `server/config/logging.ts` 配置
- 日志级别：`DEBUG`, `INFO`, `WARN`, `ERROR`
- 使用日志上下文：`LOG_CONTEXTS` 常量

### 前端日志
- 浏览器控制台
- 使用 `console.log()`, `console.error()` 等
