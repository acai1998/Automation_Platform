# 执行结果获取问题 - 快速参考

## 🔧 新增 API 端点

### 1. Jenkins 健康检查
```bash
GET /api/jenkins/health

# 作用：验证 Jenkins 连接是否正常
# 响应示例：
{
  "success": true,
  "data": {
    "connected": true,
    "jenkinsUrl": "http://jenkins.wiac.xyz:8080/",
    "version": "2.xxx"
  }
}
```

### 2. 执行诊断
```bash
GET /api/jenkins/diagnose?runId=35

# 作用：诊断单个执行的问题并提供建议
# 响应示例：
{
  "success": true,
  "data": {
    "executionId": 35,
    "status": "pending",
    "diagnostics": {
      "jenkinsInfoMissing": true,
      "suggestions": [
        "Jenkins 信息未被填充。这通常表示 Jenkins 触发失败。"
      ]
    }
  }
}
```

## 📝 修改的文件

| 文件路径 | 修改类型 | 关键改动 |
|---------|--------|--------|
| `server/routes/jenkins.ts` | 修改 | ✅ 增强日志输出 |
| | 修改 | ✅ 添加 2 个新端点 |
| `server/services/JenkinsService.ts` | 修改 | ✅ 增强 triggerBatchJob 日志 |
| `src/hooks/useExecuteCase.ts` | 修改 | ✅ 优化轮询策略 |
| `docs/TROUBLESHOOT_EXECUTION.md` | 新建 | 📖 详细故障排查指南 |
| `docs/EXECUTION_FIXES_SUMMARY.md` | 新建 | 📖 修复方案总结 |

## 🚀 快速诊断流程

```bash
# 1️⃣ 验证 Jenkins 连接
curl http://localhost:3000/api/jenkins/health

# 2️⃣ 执行一个测试用例
curl -X POST http://localhost:3000/api/jenkins/run-batch \
  -H 'Content-Type: application/json' \
  -d '{"caseIds": [1], "projectId": 1}'
# 记录返回的 runId (假设为 35)

# 3️⃣ 诊断执行问题
curl "http://localhost:3000/api/jenkins/diagnose?runId=35"

# 4️⃣ 查看后端日志输出
# 应该看到 [/api/jenkins/run-batch], [JenkinsService.triggerBatchJob] 等日志
```

## 📊 日志关键字

### ✅ 成功执行
在后端日志中查找：
```
[/api/jenkins/run-batch] Execution record created
[JenkinsService.triggerBatchJob] Response status: { status: 201
[/api/jenkins/run-batch] Jenkins trigger result: { success: true
```

### ❌ 失败执行
在后端日志中查找：
```
[JenkinsService.triggerBatchJob] Response status: { status: 401
[/api/jenkins/run-batch] Jenkins trigger failed:
[JenkinsService.triggerBatchJob] Exception:
```

## 🔍 常见问题

| 问题 | 诊断方法 | 解决方案 |
|------|--------|--------|
| Jenkins 信息为 null | `curl /api/jenkins/health` | 检查 JENKINS_URL 和认证信息 |
| 一直显示 Loading | 打开 F12，查看 Network 标签 | 查看是否有轮询请求 |
| 轮询没有更新 | 查看后端日志 | 检查 Jenkins 是否接收任务 |
| 执行返回 404 | 检查 API 路由 | 应使用 `/api/jenkins/batch/:runId` |

## 🎯 性能改进

| 指标 | 改进前 | 改进后 | 提升 |
|------|-------|-------|------|
| Pending 轮询间隔 | 10 秒 | 3 秒 | ⚡ 3.3x 更快 |
| 数据缓存策略 | 3 秒 | 无缓存 | 📈 实时获取 |
| 日志详细度 | 最小 | 完整流程 | 🔍 可观测性提升 |
| 诊断能力 | 无工具 | 自动诊断 | 🛠️ 故障排查时间减少 |

## 📚 详细文档

- **完整故障排查指南：** `docs/TROUBLESHOOT_EXECUTION.md`
- **修复方案详解：** `docs/EXECUTION_FIXES_SUMMARY.md`
- **Jenkins 集成指南：** `docs/JENKINS_INTEGRATION.md`
- **快速开始指南：** `docs/QUICK_START.md`

## 💡 使用提示

### 1. 开发环境调试
```bash
# 保持后端日志实时可见
npm run server

# 在另一个终端运行诊断
while true; do
  curl "http://localhost:3000/api/jenkins/diagnose?runId=35" | jq .
  sleep 2
done
```

### 2. 验证修改是否生效
```bash
# 检查后端是否输出新的日志格式
grep "\[/api/jenkins/run-batch\]" server-log.txt

# 检查前端是否发出了轮询请求
# 打开浏览器 F12，查看 Network 标签中 /api/jenkins/batch 请求
```

### 3. 生产环境监控
```bash
# 定期检查 Jenkins 连接
curl -s http://api.example.com/api/jenkins/health | jq '.data.connected'

# 发现故障时快速诊断
curl "http://api.example.com/api/jenkins/diagnose?runId=XXXX" | jq '.data.diagnostics.suggestions'
```

## ✨ 改进亮点

### 🔍 **可观测性提升**
- 完整的执行流程追踪
- 关键步骤的详细日志
- 自动故障诊断和建议

### ⚡ **性能优化**
- Pending 状态下快速轮询（3 秒）
- 禁用缓存获取实时数据
- Jenkins 信息更新立即反映

### 🛠️ **问题排查**
- 新增 health 检查端点
- 新增 diagnose 诊断端点
- 详细的故障排查指南

### 📖 **文档完善**
- 快速诊断流程
- 常见问题 FAQ
- 日志分析指南

---

**需要帮助？** 查看 `docs/TROUBLESHOOT_EXECUTION.md` 获取详细指导。
