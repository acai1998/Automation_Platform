# 前端集成指南

本文档说明如何在用例管理页面集成执行功能。

## 快速开始

### 1. 导入 Hooks 和组件

```tsx
import { useTestExecution } from '@/hooks/useExecuteCase';
import { ExecutionModal } from '@/components/cases/ExecutionModal';
import { ExecutionProgress } from '@/components/cases/ExecutionProgress';
```

### 2. 在组件中使用

```tsx
import React, { useState } from 'react';
import { useTestExecution } from '@/hooks/useExecuteCase';
import { ExecutionModal } from '@/components/cases/ExecutionModal';
import { ExecutionProgress } from '@/components/cases/ExecutionProgress';
import { Button } from '@/components/ui/button';

export function CaseListPage() {
  const [selectedCases, setSelectedCases] = useState<number[]>([]);
  const [projectId, setProjectId] = useState<number>(1);
  const [showModal, setShowModal] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const {
    runId,
    error,
    isExecuting,
    batchInfo,
    isFetchingBatch,
    batchError,
    executeCase,
    executeBatch,
    reset,
  } = useTestExecution();

  const handleExecute = async () => {
    if (selectedCases.length === 0) {
      alert('请先选择要执行的用例');
      return;
    }
    setShowModal(true);
  };

  const handleConfirmExecute = async () => {
    try {
      if (selectedCases.length === 1) {
        await executeCase(selectedCases[0], projectId);
      } else {
        await executeBatch(selectedCases, projectId);
      }
      setShowModal(false);
      setShowProgress(true);
    } catch (err) {
      console.error('执行失败:', err);
    }
  };

  const handleCloseProgress = () => {
    // 如果执行已完成，清空状态
    if (batchInfo?.status && !['pending', 'running'].includes(batchInfo.status)) {
      reset();
    }
    setShowProgress(false);
  };

  return (
    <div>
      {/* 用例列表表格 */}
      <div className="mb-4">
        <Button onClick={handleExecute} disabled={selectedCases.length === 0}>
          执行选中的 {selectedCases.length} 个用例
        </Button>
      </div>

      {/* 执行确认对话框 */}
      <ExecutionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirmExecute}
        caseCount={selectedCases.length}
        isLoading={isExecuting}
        error={error}
      />

      {/* 执行进度对话框 */}
      <ExecutionProgress
        isOpen={showProgress}
        onClose={handleCloseProgress}
        batchInfo={batchInfo}
        isLoading={isFetchingBatch}
        error={batchError as Error | null}
        buildUrl={batchInfo?.jenkins_build_url}
      />
    </div>
  );
}
```

## 高级用法

### 场景1: 执行前确认参数

```tsx
const [runConfig, setRunConfig] = useState<Record<string, unknown>>({
  environment: 'test',
  baseUrl: 'https://test-api.example.com',
});

// 在发送请求前添加配置
const handleConfirmExecute = async () => {
  await executeBatch(selectedCases, projectId, runConfig);
};
```

### 场景2: 自定义轮询间隔

```tsx
// 修改 useBatchExecution 调用的轮询间隔（毫秒）
const batchExecution = useBatchExecution(runId, 5000); // 5秒查询一次
```

### 场景3: 执行完成后自动刷新列表

```tsx
const queryClient = useQueryClient();

const handleCloseProgress = () => {
  if (batchInfo?.status === 'success') {
    // 刷新用例列表
    queryClient.invalidateQueries({ queryKey: ['cases'] });
  }
  reset();
  setShowProgress(false);
};
```

### 场景4: 单个用例执行

```tsx
const handleExecuteCase = async (caseId: number) => {
  try {
    await executeCase(caseId, projectId);
    setShowProgress(true);
  } catch (err) {
    console.error('执行失败:', err);
  }
};

// 在表格行中添加执行按钮
<Button 
  size="sm" 
  onClick={() => handleExecuteCase(case.id)}
>
  执行
</Button>
```

## 组件 Props 说明

### ExecutionModal

| Prop | 类型 | 说明 |
|------|------|------|
| isOpen | boolean | 是否打开对话框 |
| onClose | () => void | 关闭回调 |
| onConfirm | () => Promise<void> | 确认执行回调 |
| caseCount | number | 执行的用例数量 |
| isLoading | boolean | 是否加载中 |
| error | string \| null | 错误信息 |

### ExecutionProgress

| Prop | 类型 | 说明 |
|------|------|------|
| isOpen | boolean | 是否打开对话框 |
| onClose | () => void | 关闭回调 |
| batchInfo | BatchExecution | 执行批次信息 |
| isLoading | boolean | 是否加载中 |
| error | Error \| null | 错误信息 |
| buildUrl | string | Jenkins构建URL |

## useTestExecution Hook 返回值

```tsx
{
  // 执行状态
  runId: number | null,           // 当前执行的批次ID
  error: string | null,           // 执行错误信息
  isExecuting: boolean,           // 是否正在执行

  // 批次信息
  batchInfo: BatchExecution,      // 执行批次详情
  isFetchingBatch: boolean,       // 是否正在查询批次信息
  batchError: Error | null,       // 查询错误信息

  // 执行函数
  executeCase: (caseId, projectId) => Promise<ExecuteResult>,
  executeBatch: (caseIds, projectId) => Promise<ExecuteResult>,
  reset: () => void,              // 重置状态
}
```

## BatchExecution 接口

```tsx
interface BatchExecution {
  id: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  jenkins_build_url?: string;
  start_time?: string;
  end_time?: string;
  duration_ms?: number;
}
```

## 样式定制

### 自定义进度条颜色

修改 `ExecutionProgress.tsx`:
```tsx
<div
  className="bg-green-500 h-2 rounded-full transition-all duration-300"
  style={{ width: `${successRate}%` }}
/>
```

### 自定义状态图标

修改 `getStatusIcon()` 函数:
```tsx
const getStatusIcon = (status?: string) => {
  switch (status) {
    case 'success':
      return <YourSuccessIcon />;
    // ...
  }
};
```

## 错误处理最佳实践

```tsx
const handleExecute = async () => {
  try {
    await executeBatch(selectedCases, projectId);
    setShowProgress(true);
  } catch (err) {
    // 区分不同错误类型
    if (err instanceof Error) {
      if (err.message.includes('用例')) {
        // 用例相关错误
        console.error('用例验证失败:', err.message);
      } else if (err.message.includes('Jenkins')) {
        // Jenkins 相关错误
        console.error('Jenkins 连接失败:', err.message);
      } else {
        // 其他错误
        console.error('执行失败:', err.message);
      }
    }
    // 显示用户友好的错误提示
    toast.error('执行失败，请稍后重试');
  }
};
```

## 常见问题

### Q: 如何在表格中添加执行列？

```tsx
{
  header: '操作',
  accessorKey: 'id',
  cell: ({ row }) => (
    <Button
      size="sm"
      onClick={() => handleExecuteCase(row.original.id)}
    >
      执行
    </Button>
  ),
}
```

### Q: 如何批量选择用例？

```tsx
const [selectedCases, setSelectedCases] = useState<number[]>([]);

const handleSelectAll = (isSelected: boolean) => {
  if (isSelected) {
    setSelectedCases(cases.map(c => c.id));
  } else {
    setSelectedCases([]);
  }
};

const handleSelectCase = (caseId: number, isSelected: boolean) => {
  if (isSelected) {
    setSelectedCases([...selectedCases, caseId]);
  } else {
    setSelectedCases(selectedCases.filter(id => id !== caseId));
  }
};
```

### Q: 如何在执行完成后显示详细报告？

```tsx
useEffect(() => {
  if (batchInfo?.status === 'success' || batchInfo?.status === 'failed') {
    // 可以从 batchInfo 中提取信息
    console.log('成功:', batchInfo.passed_cases);
    console.log('失败:', batchInfo.failed_cases);
    // 或者跳转到详细报告页面
    navigate(`/reports/${runId}`);
  }
}, [batchInfo]);
```

## 集成检查清单

- [ ] 导入所有必需的 hooks 和组件
- [ ] 在页面中添加执行按钮
- [ ] 实现选择用例的逻辑
- [ ] 显示执行确认对话框
- [ ] 显示执行进度对话框
- [ ] 处理错误情况
- [ ] 测试单用例和批量执行
- [ ] 测试网络断连的恢复
- [ ] 自定义样式和文案
- [ ] 配置轮询间隔和其他参数

## 生产环境注意事项

1. **认证**: 确保 API 调用已增加认证令牌
2. **超时**: 为长时间运行的测试增加超时处理
3. **重试**: 实现失败重试逻辑
4. **监控**: 添加执行时间、成功率等指标监控
5. **日志**: 记录所有执行操作便于故障排查