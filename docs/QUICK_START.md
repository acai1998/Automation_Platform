# 快速开始指南

## 5分钟快速部署

### 步骤 1: 验证后端配置

```bash
# 确认 .env 文件中的 Jenkins 配置
cat .env | grep JENKINS

# 输出应该包含:
# JENKINS_URL=https://jenkins.wiac.xyz
# JENKINS_USER=root
# JENKINS_TOKEN=your_token
# JENKINS_JOB_API=SeleniumBaseCi-AutoTest
```

### 步骤 2: 启动后端服务

```bash
# 从项目根目录
npm run server

# 输出应该显示:
# Server listening on http://localhost:3000
```

### 步骤 3: 启动前端开发服务器

```bash
# 新开一个终端窗口
npm run dev

# 输出应该显示:
# VITE v... ready in ... ms
# ➜ Local: http://localhost:5173
```

### 步骤 4: 验证API连接

```bash
# 测试 Jenkins 连接
curl -X POST http://localhost:3000/api/health

# 应该返回:
# {"status": "ok"}
```

### 步骤 5: 在前端集成执行功能

在您的用例管理页面中添加以下代码:

```tsx
import { useTestExecution } from '@/hooks/useExecuteCase';
import { ExecutionModal } from '@/components/cases/ExecutionModal';
import { ExecutionProgress } from '@/components/cases/ExecutionProgress';

export function MyTestCasesPage() {
  const [showModal, setShowModal] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);

  const { runId, executeCase, batchInfo, isFetchingBatch } = useTestExecution();

  const handleExecute = (caseId: number) => {
    setSelectedCaseId(caseId);
    setShowModal(true);
  };

  const handleConfirm = async () => {
    if (selectedCaseId) {
      await executeCase(selectedCaseId, 1); // projectId = 1
      setShowModal(false);
      setShowProgress(true);
    }
  };

  return (
    <>
      <button onClick={() => handleExecute(1)}>执行用例1</button>

      <ExecutionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirm}
        caseCount={1}
      />

      <ExecutionProgress
        isOpen={showProgress}
        onClose={() => setShowProgress(false)}
        batchInfo={batchInfo}
        isLoading={isFetchingBatch}
      />
    </>
  );
}
```

## 测试流程

### 测试1: 单用例执行

```bash
curl -X POST http://localhost:3000/api/jenkins/run-case \
  -H "Content-Type: application/json" \
  -d '{
    "caseId": 1,
    "projectId": 1,
    "triggeredBy": 1
  }'
```

预期返回:
```json
{
  "success": true,
  "data": {
    "runId": 123,
    "buildUrl": "http://jenkins.wiac.xyz/job/.../45/"
  }
}
```

### 测试2: 查询执行进度

```bash
curl http://localhost:3000/api/jenkins/batch/123
```

预期返回:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "status": "running",
    "total_cases": 1,
    "passed_cases": 0,
    "failed_cases": 0,
    "start_time": "2024-01-08 10:00:00"
  }
}
```

### 测试3: 批量执行

```bash
curl -X POST http://localhost:3000/api/jenkins/run-batch \
  -H "Content-Type: application/json" \
  -d '{
    "caseIds": [1, 2, 3],
    "projectId": 1,
    "triggeredBy": 1
  }'
```

## 故障排查

### 问题1: API 返回 "Jenkins connection failed"

```bash
# 检查 Jenkins URL 是否正确
echo $JENKINS_URL

# 测试 Jenkins 连接
curl -u root:$JENKINS_TOKEN $JENKINS_URL/api/json

# 如果失败，更新 .env 中的 JENKINS_URL
```

### 问题2: 执行后一直显示 "loading"

```bash
# 检查后台轮询日志
# 查看浏览器控制台
# 应该看到间隔3秒的 API 请求

# 手动查询执行状态
curl http://localhost:3000/api/jenkins/batch/123

# 如果返回 404，说明 runId 错误
```

### 问题3: Jenkins 回调失败

```bash
# 检查回调 URL 是否可访问
curl -X POST http://localhost:3000/api/jenkins/callback \
  -H "Content-Type: application/json" \
  -d '{
    "runId": 123,
    "status": "success",
    "passedCases": 1,
    "failedCases": 0
  }'

# 应该返回: {"success": true}
```

## 下一步

1. **集成到页面**: 在用例列表页面添加执行按钮
2. **自定义样式**: 修改组件的颜色和文案
3. **添加权限**: 实现 API 认证
4. **监控告警**: 添加执行失败告警
5. **定时任务**: 配置定时执行计划

## 常用命令

```bash
# 启动完整应用(前端+后端)
npm run start

# 仅启动前端
npm run dev

# 仅启动后端
npm run server

# 类型检查
npx tsc --noEmit -p tsconfig.json  # 前端
npx tsc --noEmit -p tsconfig.server.json  # 后端

# 重置数据库
npm run db:reset

# 构建生产版本
npm run build
```

## 环境变量模板

创建 `.env` 文件:

```env
# 应用配置
NODE_ENV=development
PORT=3000

# 数据库配置
DB_HOST=117.72.182.23
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=autotest

# Jenkins 配置
JENKINS_URL=https://jenkins.wiac.xyz
JENKINS_USER=root
JENKINS_TOKEN=your_api_token
JENKINS_JOB_API=SeleniumBaseCi-AutoTest
JENKINS_JOB_UI=ui-automation
JENKINS_JOB_PERF=performance-automation

# 回调配置
API_CALLBACK_URL=http://localhost:3000/api/jenkins/callback
```

## 支持

遇到问题？

1. 查看 [完整集成指南](./JENKINS_INTEGRATION.md)
2. 查看 [前端集成指南](./FRONTEND_INTEGRATION_GUIDE.md)
3. 查看 [实现总结](./IMPLEMENTATION_SUMMARY.md)
4. 查看 [技术清单](./TECHNICAL_CHECKLIST.md)

---

**需要帮助?** 联系开发团队或提交 Issue