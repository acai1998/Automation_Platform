# 远程仓库同步 API 测试指南

## 环境准备

确保项目已启动：
```bash
npm run start
```

## API 测试示例

### 1. 健康检查
```bash
curl -s http://localhost:3000/api/health | jq .
```

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2025-12-31T17:26:03.004Z"
}
```

---

### 2. 获取仓库列表
```bash
curl -s http://localhost:3000/api/repositories | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": []
}
```

---

### 3. 创建仓库配置

```bash
curl -s -X POST http://localhost:3000/api/repositories \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试仓库",
    "description": "用于测试的仓库",
    "repo_url": "https://github.com/torvalds/linux.git",
    "branch": "master",
    "script_type": "javascript",
    "script_path_pattern": "**/*.js",
    "auto_create_cases": true
  }' | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1
  },
  "message": "Repository configuration created successfully"
}
```

---

### 4. 获取仓库详情

```bash
curl -s http://localhost:3000/api/repositories/1 | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "测试仓库",
    "description": "用于测试的仓库",
    "repo_url": "https://github.com/torvalds/linux.git",
    "branch": "master",
    "auth_type": "none",
    "credentials_encrypted": null,
    "script_path_pattern": "**/*.js",
    "script_type": "javascript",
    "status": "active",
    "last_sync_at": null,
    "last_sync_status": null,
    "sync_interval": 0,
    "auto_create_cases": 1,
    "created_by": null,
    "created_at": "2025-12-31 17:28:10",
    "updated_at": "2025-12-31 17:28:10"
  }
}
```

---

### 5. 测试连接

```bash
curl -s -X POST http://localhost:3000/api/repositories/1/test-connection \
  -H "Content-Type: application/json" \
  -d '{"repo_url":"https://github.com/torvalds/linux.git"}' | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "connected": true
  }
}
```

---

### 6. 获取分支列表

```bash
curl -s http://localhost:3000/api/repositories/1/branches | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    "master"
  ]
}
```

---

### 7. 更新仓库配置

```bash
curl -s -X PUT http://localhost:3000/api/repositories/1 \
  -H "Content-Type: application/json" \
  -d '{
    "description": "更新后的描述",
    "branch": "main"
  }' | jq .
```

**响应示例**:
```json
{
  "success": true,
  "message": "Repository configuration updated successfully"
}
```

---

### 8. 手动触发同步

```bash
curl -s -X POST http://localhost:3000/api/repositories/1/sync \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy": 1}' | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "syncLogId": 1,
    "status": "success",
    "totalFiles": 42,
    "addedFiles": 10,
    "modifiedFiles": 5,
    "deletedFiles": 2,
    "createdCases": 8,
    "updatedCases": 3,
    "conflicts": 0,
    "duration": 15,
    "message": "Sync completed successfully"
  }
}
```

---

### 9. 获取同步日志列表

```bash
curl -s "http://localhost:3000/api/repositories/1/sync-logs?limit=20&offset=0" | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "repo_config_id": 1,
      "sync_type": "manual",
      "status": "success",
      "total_files": 42,
      "added_files": 10,
      "modified_files": 5,
      "deleted_files": 2,
      "created_cases": 8,
      "updated_cases": 3,
      "conflicts_detected": 0,
      "error_message": null,
      "start_time": "2025-12-31 17:30:00",
      "end_time": "2025-12-31 17:30:15",
      "duration": 15,
      "triggered_by": 1,
      "created_at": "2025-12-31 17:30:00"
    }
  ],
  "total": 1
}
```

---

### 10. 获取同步日志详情

```bash
curl -s http://localhost:3000/api/repositories/1/sync-logs/1 | jq .
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "repo_config_id": 1,
    "sync_type": "manual",
    "status": "success",
    "total_files": 42,
    "added_files": 10,
    "modified_files": 5,
    "deleted_files": 2,
    "created_cases": 8,
    "updated_cases": 3,
    "conflicts_detected": 0,
    "error_message": null,
    "start_time": "2025-12-31 17:30:00",
    "end_time": "2025-12-31 17:30:15",
    "duration": 15,
    "triggered_by": 1,
    "created_at": "2025-12-31 17:30:00"
  }
}
```

---

### 11. 删除仓库配置

```bash
curl -s -X DELETE http://localhost:3000/api/repositories/1 | jq .
```

**响应示例**:
```json
{
  "success": true,
  "message": "Repository configuration deleted successfully"
}
```

---

## 前端访问

访问以下 URL 在浏览器中使用前端界面：

```
http://localhost:5173/repositories
```

## 错误处理示例

### 仓库不存在
```bash
curl -s http://localhost:3000/api/repositories/999 | jq .
```

**响应**:
```json
{
  "success": false,
  "message": "Repository not found"
}
```

### 缺少必填字段
```bash
curl -s -X POST http://localhost:3000/api/repositories \
  -H "Content-Type: application/json" \
  -d '{"description": "缺少必填字段"}' | jq .
```

**响应**:
```json
{
  "success": false,
  "message": "name and repo_url are required"
}
```

## 脚本类型支持

### JavaScript/TypeScript
- 支持 Jest describe/it 语法
- 支持 Mocha 测试框架
- 自动提取测试用例

### Python
- 支持 unittest 类方法
- 支持 pytest 函数式测试
- 自动识别 test_ 前缀函数

### Java
- 支持 JUnit @Test 注解
- 自动提取测试方法

## 常见问题

### Q: 同步时间很长
A: 第一次同步会克隆整个仓库，可能需要较长时间。后续同步只会拉取更新，速度会更快。

### Q: 如何处理大型仓库
A: 可以使用 `script_path_pattern` 来限制扫描范围，例如只扫描 `tests/` 目录下的文件。

### Q: 如何支持私有仓库
A: 目前支持通过 SSH 密钥进行认证，凭证会被加密存储在 `credentials_encrypted` 字段。

### Q: 同步失败了怎么办
A: 检查同步日志中的 `error_message` 字段，可能是网络问题或仓库地址错误。

## 性能建议

1. **限制脚本路径模式** - 避免扫描整个仓库
2. **定期清理日志** - 防止数据库过大
3. **批量操作** - 避免频繁的小规模同步
4. **使用分支** - 只同步特定分支而不是所有分支

---

**最后更新**: 2026年1月1日