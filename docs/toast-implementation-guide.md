# Toast 提示实施指南（桌面端版）

## 快速开始

### 1. 在 BaseCaseList 中集成双按钮 Toast

**文件**：`src/components/cases/BaseCaseList.tsx`

**步骤 1**：添加导入

```typescript
// 在文件顶部添加
import { showExecutionSuccessToast, showExecutionErrorToast } from '@/components/ui/execution-toast';
```

**步骤 2**：替换 handleRunCase 函数中的 Toast 调用

找到第 172-208 行的 `handleRunCase` 函数，替换为：

```typescript
// 处理运行用例
const handleRunCase = async (caseId: number, caseName: string, projectId: number | null) => {
  const finalProjectId = projectId || 1;

  // 设置加载状态
  setLoadingCaseIds(prev => new Set(prev).add(caseId));

  try {
    const result = await executeCase(caseId, finalProjectId);

    // 使用新的双按钮 Toast（可选显示用例名称）
    showExecutionSuccessToast({
      runId: result.runId,
      buildUrl: result.buildUrl,
      // caseName: caseName, // 可选：如果需要显示用例名称，取消注释此行
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : '执行失败';

    // 使用新的错误 Toast（带重试功能）
    showExecutionErrorToast({
      message,
      description: '请检查 Jenkins 连接或稍后重试',
      onRetry: () => handleRunCase(caseId, caseName, projectId),
    });

  } finally {
    // 移除加载状态
    setLoadingCaseIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(caseId);
      return newSet;
    });
  }
};
```

---

## 效果预览

### 成功提示（双按钮版）

```
┌────────────────────────────────────────────────────────┐
│                                                    [×] │
│  ✓  测试用例已开始执行                                 │
│                                                        │
│  执行任务已创建，可通过以下方式查看进度                │
│                                                        │
│       [📊 查看记录]         [🔗 查看 Jenkins] →        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**特点**：
- ✅ 固定宽度 420px，不会因内容长度变化
- ✅ 两个操作按钮：查看平台记录 + 查看 Jenkins
- ✅ 右上角关闭按钮，用户可手动关闭
- ✅ 6 秒后自动关闭

---

### 失败提示（带重试按钮）

```
┌────────────────────────────────────────────────────────┐
│                                                    [×] │
│  ✗  执行失败                                           │
│                                                        │
│  请检查 Jenkins 连接或稍后重试                         │
│                                                        │
│       [🔄 重试]                                        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**特点**：
- ✅ 红色边框和图标，突出错误状态
- ✅ 提供重试按钮，点击后自动重新执行
- ✅ 5 秒后自动关闭

---

## 完整实施步骤

### 步骤 1：确认组件文件存在

确认以下文件已创建：
- ✅ `src/components/ui/execution-toast.tsx`

### 步骤 2：修改 BaseCaseList.tsx

**原代码**（第 1-8 行的导入部分）：
```typescript
import { useState, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { Search, Play, ChevronLeft, ChevronRight, Loader2, RefreshCw, FileText, User, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useCases, usePagination, type CaseType, type TestCase } from '@/hooks/useCases';
import { useTestExecution } from '@/hooks/useExecuteCase';
import { toast } from 'sonner';
```

**修改为**：
```typescript
import { useState, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { Search, Play, ChevronLeft, ChevronRight, Loader2, RefreshCw, FileText, User, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useCases, usePagination, type CaseType, type TestCase } from '@/hooks/useCases';
import { useTestExecution } from '@/hooks/useExecuteCase';
import { showExecutionSuccessToast, showExecutionErrorToast } from '@/components/ui/execution-toast';
```

**注意**：移除 `import { toast } from 'sonner';`，改为导入自定义 Toast 组件。

---

**原代码**（第 172-208 行的 handleRunCase 函数）：
```typescript
// 处理运行用例
const handleRunCase = async (caseId: number, caseName: string, projectId: number | null) => {
  // 如果没有项目ID，使用默认项目ID 1
  const finalProjectId = projectId || 1;

  // 设置该用例为加载状态
  setLoadingCaseIds(prev => new Set(prev).add(caseId));

  try {
    const result = await executeCase(caseId, finalProjectId);

    // 显示成功提示 - 优化版：简洁提示 + 链接
    const description = result?.buildUrl
      ? '执行任务已创建，点击下方按钮查看详情'
      : '执行任务已创建，请稍后在运行记录页面查看结果';

    toast.success('测试用例已开始执行', {
      description,
      duration: 6000,
      action: result?.buildUrl ? {
        label: '查看 Jenkins',
        onClick: () => window.open(result.buildUrl, '_blank')
      } : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '执行失败';
    toast.error(message, {
      description: '请检查 Jenkins 连接或稍后重试',
      duration: 4000,
    });
  } finally {
    // 移除该用例的加载状态
    setLoadingCaseIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(caseId);
      return newSet;
    });
  }
};
```

**修改为**：
```typescript
// 处理运行用例
const handleRunCase = async (caseId: number, caseName: string, projectId: number | null) => {
  const finalProjectId = projectId || 1;

  // 设置该用例为加载状态
  setLoadingCaseIds(prev => new Set(prev).add(caseId));

  try {
    const result = await executeCase(caseId, finalProjectId);

    // 使用新的双按钮 Toast
    showExecutionSuccessToast({
      runId: result.runId,
      buildUrl: result.buildUrl,
      // caseName: caseName, // 可选：显示用例名称
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : '执行失败';

    // 使用新的错误 Toast（带重试功能）
    showExecutionErrorToast({
      message,
      description: '请检查 Jenkins 连接或稍后重试',
      onRetry: () => handleRunCase(caseId, caseName, projectId),
    });

  } finally {
    // 移除该用例的加载状态
    setLoadingCaseIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(caseId);
      return newSet;
    });
  }
};
```

---

### 步骤 3：测试功能

1. **启动开发服务器**
   ```bash
   npm run dev
   ```

2. **测试成功场景**
   - 进入任意测试用例页面（API/UI/性能）
   - 点击某个用例的"运行"按钮
   - 观察 Toast 提示是否正确显示
   - 点击"查看记录"按钮，确认跳转到 `/reports/{runId}`
   - 点击"查看 Jenkins"按钮，确认在新标签页打开 Jenkins

3. **测试失败场景**
   - 停止 Jenkins 服务或修改配置使其连接失败
   - 点击"运行"按钮
   - 观察错误 Toast 是否显示
   - 点击"重试"按钮，确认重新触发执行

4. **测试关闭功能**
   - 点击 Toast 右上角的 [×] 按钮
   - 确认 Toast 立即关闭

---

## 可选配置

### 选项 1：显示用例名称

如果你希望在 Toast 中显示用例名称（截断显示），可以取消注释 `caseName` 参数：

```typescript
showExecutionSuccessToast({
  runId: result.runId,
  buildUrl: result.buildUrl,
  caseName: caseName, // 显示用例名称（鼠标悬停显示完整名称）
});
```

**效果**：
```
┌────────────────────────────────────────────────────────┐
│                                                    [×] │
│  ✓  测试用例已开始执行                                 │
│                                                        │
│  执行任务已创建，可通过以下方式查看进度                │
│  测试用户登录功能验证流程包含多因素认证...             │  ← 用例名称（截断）
│                                                        │
│       [📊 查看记录]         [🔗 查看 Jenkins] →        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### 选项 2：修改显示时长

在 `src/components/ui/execution-toast.tsx` 中修改：

```typescript
export function showExecutionSuccessToast(options: Omit<ExecutionToastProps, 'toastId'>) {
  return toast.custom(
    (t) => <ExecutionSuccessToast toastId={t} {...options} />,
    {
      duration: 6000, // 修改这里（单位：毫秒）
      position: 'top-right',
    }
  );
}
```

---

### 选项 3：修改显示位置

支持的位置选项：
- `top-left`
- `top-center`
- `top-right`（默认）
- `bottom-left`
- `bottom-center`
- `bottom-right`

```typescript
export function showExecutionSuccessToast(options: Omit<ExecutionToastProps, 'toastId'>) {
  return toast.custom(
    (t) => <ExecutionSuccessToast toastId={t} {...options} />,
    {
      duration: 6000,
      position: 'bottom-right', // 修改这里
    }
  );
}
```

---

## 在其他页面中使用

### 任务执行页面（Tasks.tsx）

如果任务页面也有执行功能，可以同样使用：

```typescript
import { showExecutionSuccessToast } from '@/components/ui/execution-toast';

const handleExecuteTask = async (taskId: number) => {
  try {
    const result = await executeTask(taskId);

    showExecutionSuccessToast({
      runId: result.runId,
      buildUrl: result.buildUrl,
      isBatch: true, // 标记为批量执行
      batchCount: result.caseCount, // 用例数量
    });
  } catch (error) {
    showExecutionErrorToast({
      message: '任务执行失败',
      description: error.message,
      onRetry: () => handleExecuteTask(taskId),
    });
  }
};
```

**效果**：
```
┌────────────────────────────────────────────────────────┐
│                                                    [×] │
│  ✓  批量执行已开始 (5 个用例)                          │
│                                                        │
│  执行任务已创建，可通过以下方式查看进度                │
│                                                        │
│       [📊 查看记录]         [🔗 查看 Jenkins] →        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 故障排查

### 问题 1：Toast 不显示

**可能原因**：
- Toaster 组件未正确配置
- 导入路径错误

**解决方法**：
1. 确认 `src/App.tsx` 中包含 `<Toaster />` 组件
2. 检查导入路径是否正确：`@/components/ui/execution-toast`

---

### 问题 2：点击"查看记录"没有跳转

**可能原因**：
- `runId` 未正确传递
- 路由配置问题

**解决方法**：
1. 在浏览器控制台检查 `result.runId` 的值
2. 确认 `/reports/:id` 路由已配置

---

### 问题 3：样式显示异常

**可能原因**：
- Tailwind CSS 未正确配置
- 暗黑模式类名冲突

**解决方法**：
1. 确认 `tailwind.config.js` 配置正确
2. 检查是否有全局样式覆盖

---

## 对比总结

| 特性 | 原实现 | 新实现 |
|------|--------|--------|
| 标题长度 | 动态（可能很长） | 固定（10 字符） |
| 操作按钮 | 1 个（Jenkins） | 2 个（记录 + Jenkins） |
| 关闭方式 | 仅自动关闭 | 自动 + 手动关闭 |
| 失败重试 | 无 | 有 |
| 批量执行 | 无区分 | 显示用例数量 |
| Toast 宽度 | 自适应 | 固定 420px |
| 视觉设计 | 基础 | 增强（图标、间距、颜色） |

---

## 完成清单

- [ ] 创建 `execution-toast.tsx` 组件
- [ ] 修改 `BaseCaseList.tsx` 导入
- [ ] 替换 `handleRunCase` 函数中的 Toast 调用
- [ ] 测试成功场景
- [ ] 测试失败场景
- [ ] 测试关闭功能
- [ ] （可选）在其他页面中集成
- [ ] （可选）调整显示时长和位置

---

## 预期收益

✅ **用户体验提升**
- 提示信息更简洁，不会因用例名称过长而换行
- 提供两个操作入口，满足不同查看需求
- 失败时可以快速重试，无需重新点击

✅ **视觉效果改善**
- 统一的宽度和间距，视觉上更整洁
- 图标和颜色增强识别度
- 暗黑模式完美支持

✅ **交互体验优化**
- 手动关闭按钮，用户掌控感更强
- 按钮文案和图标清晰，降低认知成本
- 重试功能减少操作步骤

---

实施完成后，建议收集用户反馈，持续优化 Toast 提示的内容和交互方式。
