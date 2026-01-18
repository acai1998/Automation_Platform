# Jenkinsfile 修复说明

## 问题诊断

您遇到的问题有两个根本原因：

### 1. Jenkins Pipeline 执行失败
**错误信息：**
```
org.jenkinsci.plugins.workflow.steps.MissingContextVariableException: 
Required context class hudson.FilePath is missing
```

**原因：** `post` 块中的所有步骤都在 `node` 块外执行，导致缺少执行上下文。

### 2. 平台一直显示"运行中"
**原因：** 由于 Jenkins 执行失败且没有回调结果，平台无法获知执行已完成。

---

## ✅ 已实施的修复

### 1. 修复 post 块执行上下文
所有 `post` 块（`always`, `success`, `failure`）现在都用 `node` 包装，确保有正确的执行上下文。

### 2. 添加失败时的回调机制
当 Pipeline 执行失败时，自动回调平台，将状态设置为 `failed`。

### 3. 处理缺少仓库 URL 的情况
当 `REPO_URL` 参数未提供时，显示警告而不是失败。

---

## 🚀 下一步

1. **确保 Jenkinsfile 已更新**
   - 重新加载 Jenkins Job 配置
   - 或手动更新 Jenkinsfile

2. **再次执行测试**
   ```bash
   curl -X POST http://localhost:3000/api/jenkins/run-batch \
     -H 'Content-Type: application/json' \
     -d '{"caseIds": [117], "projectId": 1}'
   ```

3. **验证修复**
   - 检查 Jenkins Console Output 没有错误
   - 验证平台状态正确（如果失败应显示 failed）
   - 前端应能正确显示执行结果

---

## 📋 关键修复点

| 修复项 | 说明 |
|--------|------|
| post.always | 用 node 块包装以提供执行上下文 |
| post.failure | 新增失败回调逻辑 |
| post.success | 用 node 块包装 |
| 检出代码阶段 | 处理缺少 REPO_URL 的情况 |
