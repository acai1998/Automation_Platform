# 快速开始 - 远程仓库同步功能调试

## 🚀 5 分钟快速体验

### 步骤 1: 启动项目（1 分钟）

```bash
cd /Users/wb_caijinwei/Automation_Platform
npm run start
```

**预期输出**:
```
✅ Vite ready at http://localhost:5174
✅ Express server listening on port 3000
```

---

### 步骤 2: 访问前端（1 分钟）

打开浏览器，访问:
```
http://localhost:5174/repositories
```

**预期看到**:
- 仓库列表页面
- 已有一个 "SeleniumBase-CI Debug" 仓库

---

### 步骤 3: 查看仓库详情（1 分钟）

点击仓库列表中的 "SeleniumBase-CI Debug" 仓库

**预期看到**:
- 仓库名称
- Git URL: https://gitee.com/Ac1998/SeleniumBase-CI.git
- 脚本类型: Python
- 路径模式: test_case/**/*.py
- 最后同步时间

---

### 步骤 4: 触发同步（1 分钟）

点击"同步"或"立即同步"按钮

**预期看到**:
- 同步进度提示
- 同步完成后显示成功消息
- 显示统计信息:
  ```
  总文件数: 53
  新增文件: 53
  创建用例: 53
  状态: ✅ 成功
  ```

---

### 步骤 5: 查看同步结果（1 分钟）

点击"查看日志"查看同步详情

**预期看到**:
- 同步日志列表
- 同步时间、状态、文件统计
- 详细的同步过程记录

---

## 🎯 核心功能演示

### 功能 1: 创建仓库

```bash
# 使用 API 创建仓库
curl -X POST http://localhost:3000/api/repositories \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test Repo",
    "repo_url": "https://github.com/example/test-scripts.git",
    "branch": "main",
    "script_type": "javascript",
    "script_path_pattern": "tests/**/*.test.js",
    "auto_create_cases": true
  }'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "id": 3
  }
}
```

---

### 功能 2: 触发同步

```bash
# 触发仓库同步
curl -X POST http://localhost:3000/api/repositories/2/sync \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy": 1}'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "syncLogId": 1,
    "status": "success",
    "totalFiles": 53,
    "addedFiles": 53,
    "createdCases": 53,
    "duration": 0,
    "message": "Sync completed successfully"
  }
}
```

---

### 功能 3: 查看同步日志

```bash
# 获取同步日志
curl "http://localhost:3000/api/repositories/2/sync-logs?limit=10"
```

**预期响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "repo_config_id": 2,
      "sync_type": "manual",
      "status": "success",
      "total_files": 53,
      "added_files": 53,
      "created_cases": 53,
      "created_at": "2025-12-31 17:36:10"
    }
  ]
}
```

---

### 功能 4: 查看创建的用例

```bash
# 获取导入的用例
curl "http://localhost:3000/api/cases?limit=20"
```

**预期响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 28,
      "name": "test_xkcd",
      "script_path": "test_case/test_xkcd.py",
      "tags": "auto-imported,python,pytest",
      "status": "active"
    },
    ...
  ]
}
```

---

## 📊 数据库验证

### 验证用例创建

```bash
sqlite3 server/db/autotest.db \
  "SELECT COUNT(*) as total FROM test_cases WHERE script_path LIKE 'test_case%';"
```

**预期结果**: `53`

---

### 验证同步日志

```bash
sqlite3 server/db/autotest.db \
  "SELECT id, status, total_files, created_cases FROM sync_logs ORDER BY created_at DESC LIMIT 5;"
```

**预期结果**:
```
1|success|53|53
```

---

### 验证脚本映射

```bash
sqlite3 server/db/autotest.db \
  "SELECT COUNT(*) as total FROM repository_script_mappings WHERE repo_config_id = 2;"
```

**预期结果**: `53`

---

## 🔍 故障排查

### 问题: 后端无法启动

**症状**: `Error: listen EADDRINUSE: address already in use :::3000`

**解决方案**:
```bash
# 杀死占用 3000 端口的进程
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# 重新启动
npm run start
```

---

### 问题: 前端页面空白

**症状**: 访问 http://localhost:5174/repositories 显示空白

**解决方案**:
1. 按 F12 打开浏览器开发者工具
2. 查看 Console 标签是否有错误
3. 查看 Network 标签是否有请求失败
4. 重新加载页面 (Ctrl+R 或 Cmd+R)

---

### 问题: 同步失败

**症状**: 同步操作返回错误

**解决方案**:
1. 检查网络连接
2. 检查 Git URL 是否正确
3. 查看后端日志获取详细错误信息

---

## 📈 性能指标

| 操作 | 预期耗时 | 实际耗时 |
|------|---------|---------|
| 启动后端 | < 5 秒 | ✅ ~2 秒 |
| 启动前端 | < 10 秒 | ✅ ~3 秒 |
| 同步 53 个文件 | < 10 秒 | ✅ ~1 秒 |
| 页面加载 | < 2 秒 | ✅ ~0.5 秒 |
| API 响应 | < 1 秒 | ✅ ~100ms |

---

## 💡 高级用法

### 创建多个仓库

```bash
# 创建 JavaScript 仓库
curl -X POST http://localhost:3000/api/repositories \
  -H "Content-Type: application/json" \
  -d '{
    "name": "JS Test Scripts",
    "repo_url": "https://github.com/example/js-tests.git",
    "script_type": "javascript",
    "script_path_pattern": "**/*.test.js"
  }'

# 创建 Java 仓库
curl -X POST http://localhost:3000/api/repositories \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Java Test Scripts",
    "repo_url": "https://github.com/example/java-tests.git",
    "script_type": "java",
    "script_path_pattern": "**/*Test.java"
  }'
```

---

### 批量同步

```bash
# 同步所有仓库
for repo_id in 1 2 3; do
  curl -X POST http://localhost:3000/api/repositories/$repo_id/sync \
    -H "Content-Type: application/json" \
    -d '{"triggeredBy": 1}'
done
```

---

### 导出同步报告

```bash
# 导出同步日志为 CSV
sqlite3 server/db/autotest.db \
  ".mode csv" \
  ".output sync_report.csv" \
  "SELECT * FROM sync_logs ORDER BY created_at DESC;"

cat sync_report.csv
```

---

## 🎓 学习资源

### 文档
- 📖 `DEBUGGING_REPORT.md` - 详细调试报告
- 📖 `DEBUGGING_SUMMARY.md` - 调试总结
- 📖 `FRONTEND_TESTING_GUIDE.md` - 前端测试指南
- 📖 `docs/IMPLEMENTATION_SUMMARY.md` - 实现总结

### 代码
- 💻 `server/services/RepositoryService.ts` - Git 操作
- 💻 `server/services/RepositorySyncService.ts` - 同步逻辑
- 💻 `server/routes/repositories.ts` - API 路由
- 💻 `src/pages/RepositoryManagement.tsx` - 前端页面

---

## 🚀 下一步

### 立即可做
- [ ] 访问前端页面查看仓库列表
- [ ] 创建新的仓库配置
- [ ] 手动触发同步操作
- [ ] 查看创建的测试用例

### 短期任务
- [ ] 测试不同的脚本类型
- [ ] 测试错误处理
- [ ] 测试并发操作
- [ ] 优化同步性能

### 长期规划
- [ ] 实现定时同步
- [ ] 添加 Webhook 支持
- [ ] 支持更多编程语言
- [ ] 实现同步预览

---

## ✅ 检查清单

完成以下项目以验证功能:

- [ ] 后端服务正常运行
- [ ] 前端服务正常运行
- [ ] 可以访问仓库管理页面
- [ ] 可以看到 SeleniumBase-CI 仓库
- [ ] 可以手动触发同步
- [ ] 同步成功完成
- [ ] 显示正确的统计信息
- [ ] 可以查看同步日志
- [ ] 数据库中有用例记录
- [ ] 没有错误信息

---

## 📞 快速命令参考

```bash
# 启动项目
npm run start

# 访问前端
open http://localhost:5174/repositories

# 查看后端日志
tail -f server/logs/*.log

# 查看数据库
sqlite3 server/db/autotest.db

# 重置数据库
npm run db:reset

# 运行类型检查
npx tsc --noEmit

# 构建前端
npm run build
```

---

**准备好了吗？现在就开始吧！** 🎉

访问 http://localhost:5174/repositories 查看您的远程仓库同步功能！