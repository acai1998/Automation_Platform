# ERROR 占位符修复 - 验证清单

## 🎯 修复目标

消除"运行成功但用例显示 ERROR"的问题。

## ✅ 代码修复验证

### 第 1 步：检查 jenkins.ts 修改

```bash
grep -n "【修复】严格验证：必须有有效的 caseId" server/routes/jenkins.ts
```

**预期输出**：第 313 行左右有这个注释

**验证内容**：
- ✓ caseId 必须 > 0
- ✓ 无效 caseId 的回调被过滤掉
- ✓ 不再生成 caseId=0 的垃圾记录

---

### 第 2 步：检查 ExecutionRepository.ts 修改

```bash
grep -n "【第 [1-4] 层】" server/repositories/ExecutionRepository.ts | head -4
```

**预期输出**：4 个层级的注释

**验证内容**：
- ✓ 第 1 层：caseId 精确匹配
- ✓ 第 2 层：caseName 精确匹配
- ✓ 第 3 层：大小写不敏感匹配
- ✓ 第 4 层：模糊匹配 + 去掉命名空间

---

### 第 3 步：检查 ExecutionService.ts 修改

```bash
grep -n "【重要】必须无条件执行" server/services/ExecutionService.ts
```

**预期输出**：第 260 行左右有这个注释

**验证内容**：
- ✓ 无条件扫描 ERROR 占位符
- ✓ 检查是否仍有 status='error' 的记录
- ✓ 根据运行状态清理它们

---

### 第 4 步：检查清理脚本

```bash
ls -la scripts/cleanup-invalid-results.ts
```

**预期输出**：文件存在且可读

**验证内容**：
- ✓ 清理 caseId=0 的记录
- ✓ 清理 caseName='' 的记录
- ✓ 识别孤立 ERROR 占位符

---

## 🧪 功能验证

### 环境准备

```bash
# 1. 构建后端
npm run server:build

# 2. 清理历史垃圾数据
npm run cleanup:results

# 3. 启动服务
npm start  # 或 npm run dev + npm run server
```

---

### 场景 A：标准回调（有 caseId）

**测试用例**：
```bash
curl -X POST http://autotest.wiac.xyz/api/jenkins/callback \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 400,
    "status": "success",
    "results": [
      {
        "caseId": 1,
        "caseName": "test_case_1",
        "status": "passed",
        "duration": 1000
      }
    ]
  }'
```

**预期结果**：
- ✅ 运行显示 `Completed`
- ✅ 质量显示 `All Passed`
- ✅ 用例显示 `passed`（绿色）

---

### 场景 B：缺 caseId（仅有 caseName）

**测试用例**：
```bash
curl -X POST http://autotest.wiac.xyz/api/jenkins/callback \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 401,
    "status": "success",
    "results": [
      {
        "caseName": "test_case_2",
        "status": "passed",
        "duration": 1000
      }
    ]
  }'
```

**预期结果**：
- ✅ 日志显示 "Filtered out test result: missing valid caseId"
- ✅ 这条记录不会进入系统
- ✅ 占位符通过批量清理变为 `passed`

---

### 场景 C：caseName 格式差异

**测试用例**：
```bash
# 假设占位符 caseName 是 'TestGeolocation::test_geolocation'
curl -X POST http://autotest.wiac.xyz/api/jenkins/callback \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 402,
    "status": "success",
    "results": [
      {
        "caseId": 1,
        "caseName": "test_geolocation",  # 缺少命名空间前缀
        "status": "passed",
        "duration": 1000
      }
    ]
  }'
```

**预期结果**：
- ✅ 通过第 4 层模糊匹配，仍然能匹配到占位符
- ✅ 占位符被更新为 `passed`
- ✅ 用户看到 `passed`，不是 ERROR

---

## 📊 数据库验证

### 清理前检查

```sql
-- 检查垃圾记录数量
SELECT COUNT(*) as garbage_count 
FROM Auto_TestRunResults 
WHERE caseId = 0 OR caseName = '';

-- 检查 ERROR 占位符
SELECT executionId, COUNT(*) as error_count
FROM Auto_TestRunResults
WHERE status = 'error'
GROUP BY executionId
LIMIT 10;
```

### 清理后检查

```bash
npm run cleanup:results
```

输出示例：
```
【第 1 步】查找 caseId=0 的记录...
  找到 127 条 caseId=0 的记录
  ✓ 已删除 127 条

【第 2 步】查找 caseName='' 的记录...
  找到 43 条 caseName='' 的记录
  ✓ 已删除 43 条

【统计】清理完成后的数据统计：
  总记录数: 5432
  - passed:  3210
  - failed:  543
  - skipped: 210
  - error:   469  # 应该继续减少
```

---

## 🔍 日志诊断

### 查看清理日志

```bash
# 查看最近的清理操作
tail -f server.log | grep "Cleaned up orphaned ERROR"

# 示例输出：
# [INFO] Cleaned up orphaned ERROR placeholders
#   executionId: 123
#   cleanedCount: 5
#   mappedStatus: passed
```

### 查看过滤日志

```bash
tail -f server.log | grep "Filtered out test result"

# 示例输出：
# [WARN] Filtered out test result: missing valid caseId
#   caseId: 0
#   caseName: "test_geolocation"
```

---

## ✨ 完整验证流程

```bash
#!/bin/bash

echo "开始验证 ERROR 占位符修复..."
echo ""

# 1. 代码检查
echo "【1】检查代码修改..."
grep -q "【修复】严格验证：必须有有效的 caseId" server/routes/jenkins.ts && echo "✓ jenkins.ts 修改正确" || echo "✗ jenkins.ts 修改缺失"
grep -q "【第 1 层】" server/repositories/ExecutionRepository.ts && echo "✓ ExecutionRepository.ts 修改正确" || echo "✗ ExecutionRepository.ts 修改缺失"
grep -q "【重要】必须无条件执行" server/services/ExecutionService.ts && echo "✓ ExecutionService.ts 修改正确" || echo "✗ ExecutionService.ts 修改缺失"
echo ""

# 2. 清理垃圾数据
echo "【2】清理历史垃圾数据..."
npm run cleanup:results
echo ""

# 3. 构建项目
echo "【3】构建项目..."
npm run server:build
if [ $? -eq 0 ]; then
  echo "✓ 构建成功"
else
  echo "✗ 构建失败"
  exit 1
fi
echo ""

echo "✓ 验证完成！"
echo "下一步：部署新代码并运行测试任务"
```

---

## 📋 最终检查表

- [ ] 代码修改已验证
- [ ] 清理脚本已运行
- [ ] 项目构建成功
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 错误
- [ ] 场景 A 测试通过（标准回调）
- [ ] 场景 B 测试通过（缺 caseId）
- [ ] 场景 C 测试通过（caseName 差异）
- [ ] 运行监控任务，确认无 ERROR 显示
- [ ] 数据库垃圾记录减少

---

## 🚨 如果仍然看到 ERROR

### 排查步骤

1. **确认代码已部署**
   ```bash
   grep "【修复】严格验证" server/routes/jenkins.ts
   # 如果无输出，说明代码未更新
   ```

2. **检查清理脚本是否运行**
   ```bash
   npm run cleanup:results
   ```

3. **查看最新的运行日志**
   ```bash
   tail -100 server.log | grep -A5 "Cleaned up\|Filtered out"
   ```

4. **查询数据库最新记录**
   ```sql
   SELECT * FROM Auto_TestRunResults 
   WHERE status = 'error' 
   ORDER BY create_time DESC 
   LIMIT 5;
   ```

5. **联系团队调查**
   - 收集运行 ID
   - 收集回调数据
   - 收集日志片段

---

## 📞 技术支持

- 修复版本：v2（终极修复）
- 修复时间：2026-03-15
- 修复者：CatPaw AI
- 相关 Issue：#302
