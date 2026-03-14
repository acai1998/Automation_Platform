# 执行 Toast 组件使用指南

## 概述

`execution-toast.tsx` 提供了两个自定义 Toast 组件：
1. **ExecutionSuccessToast** - 显示执行成功提示
2. **ExecutionErrorToast** - 显示执行失败提示

这些组件相比默认的 sonner toast，提供了更丰富的交互和更好的用户体验。

---

## 快速开始

### 1. 基本用法（单个用例执行）

```typescript
import { showExecutionSuccessToast } from '@/components/ui/execution-toast';

// 在执行成功后调用
const result = await executeCase(caseId, projectId);

showExecutionSuccessToast({
  runId: result.runId,
  buildUrl: result.buildUrl,
  caseName: '测试用户登录功能', // 可选
});
```

**效果**：
```
┌───────────────────────────────────────────────────┐
│ ✓ 测试用例已开始执行                    [X]       │
│ 执行任务已创建，可通过以下方式查看进度            │
│ 测试用户登录功能                                  │
│                                                   │
│     [查看记录]    [查看 Jenkins]                  │
└───────────────────────────────────────────────────┘
```

---

### 2. 批量执行

```typescript
import { showExecutionSuccessToast } from '@/components/ui/execution-toast';

// 批量执行多个用例
const result = await executeBatch(caseIds, projectId);

showExecutionSuccessToast({
  runId: result.runId,
  buildUrl: result.buildUrl,
  isBatch: true,
  batchCount: caseIds.length,
});
```

**效果**：
```
┌───────────────────────────────────────────────────┐
│ ✓ 批量执行已开始 (5 个用例)            [X]        │
│ 执行任务已创建，可通过以下方式查看进度            │
│                                                   │
│     [查看记录]    [查看 Jenkins]                  │
└───────────────────────────────────────────────────┘
```

---

### 3. 执行失败

```typescript
import { showExecutionErrorToast } from '@/components/ui/execution-toast';

try {
  await executeCase(caseId, projectId);
} catch (error) {
  showExecutionErrorToast({
    message: '执行失败',
    description: error.message || '请检查 Jenkins 连接或稍后重试',
    onRetry: () => {
      // 重试逻辑
      handleRunCase(caseId, caseName, projectId);
    },
  });
}
```

**效果**：
```
┌───────────────────────────────────────────────────┐
│ ✗ 执行失败                              [X]       │
│ 请检查 Jenkins 连接或稍后重试                     │
│                                                   │
│     [重试]                                        │
└───────────────────────────────────────────────────┘
```

---

## 在 BaseCaseList 中集成

### 替换现有的 Toast 实现

**修改文件**：`src/components/cases/BaseCaseList.tsx`

**原代码**（第 183-193 行）：
```typescript
toast.success('测试用例已开始执行', {
  description,
  duration: 6000,
  action: result?.buildUrl ? {
    label: '查看 Jenkins',
    onClick: () => window.open(result.buildUrl, '_blank')
  } : undefined,
});
```

**新代码**：
```typescript
import { showExecutionSuccessToast } from '@/components/ui/execution-toast';

// 在 handleRunCase 函数中
try {
  const result = await executeCase(caseId, finalProjectId);

  // 使用新的 Toast 组件
  showExecutionSuccessToast({
    runId: result.runId,
    buildUrl: result.buildUrl,
    caseName: caseName, // 可选，用于显示更多上下文
  });
} catch (err) {
  const message = err instanceof Error ? err.message : '执行失败';

  // 使用新的错误 Toast 组件
  showExecutionErrorToast({
    message,
    description: '请检查 Jenkins 连接或稍后重试',
    onRetry: () => handleRunCase(caseId, caseName, projectId),
  });
}
```

---

## 完整实现示例

### BaseCaseList.tsx 完整修改

```typescript
import { showExecutionSuccessToast, showExecutionErrorToast } from '@/components/ui/execution-toast';

// ... 其他导入

export function BaseCaseList({ type, title, icon, columns, description }: BaseCaseListProps) {
  // ... 其他代码

  // 处理运行用例
  const handleRunCase = async (caseId: number, caseName: string, projectId: number | null) => {
    const finalProjectId = projectId || 1;

    // 设置加载状态
    setLoadingCaseIds(prev => new Set(prev).add(caseId));

    try {
      const result = await executeCase(caseId, finalProjectId);

      // 显示成功提示（双按钮版本）
      showExecutionSuccessToast({
        runId: result.runId,
        buildUrl: result.buildUrl,
        caseName: caseName, // 可选：显示用例名称
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : '执行失败';

      // 显示错误提示（带重试按钮）
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

  // ... 其他代码
}
```

---

## 在其他页面中使用

### 1. 任务执行页面（Tasks.tsx）

```typescript
import { showExecutionSuccessToast } from '@/components/ui/execution-toast';

const handleExecuteTask = async (taskId: number) => {
  try {
    const result = await executeTask(taskId);

    showExecutionSuccessToast({
      runId: result.runId,
      buildUrl: result.buildUrl,
      isBatch: true,
      batchCount: result.caseCount,
    });
  } catch (error) {
    // 错误处理
  }
};
```

---

### 2. 报告详情页（ReportDetail.tsx）

```typescript
import { showExecutionSuccessToast } from '@/components/ui/execution-toast';

const handleRerun = async () => {
  try {
    const result = await rerunExecution(executionId);

    showExecutionSuccessToast({
      runId: result.runId,
      buildUrl: result.buildUrl,
    });
  } catch (error) {
    // 错误处理
  }
};
```

---

## 自定义配置

### 修改显示时长

```typescript
showExecutionSuccessToast({
  runId: result.runId,
  buildUrl: result.buildUrl,
  // duration 在 showExecutionSuccessToast 内部设置为 6000ms
  // 如需修改，可以直接使用 toast.custom
});

// 或者修改源代码中的 duration 参数
```

---

### 修改位置

在 `execution-toast.tsx` 中修改 `position` 参数：

```typescript
export function showExecutionSuccessToast(options: Omit<ExecutionToastProps, 'toastId'>) {
  return toast.custom(
    (t) => <ExecutionSuccessToast toastId={t} {...options} />,
    {
      duration: 6000,
      position: 'top-right', // 可选：top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
    }
  );
}
```

---

### 修改样式

在 `ExecutionSuccessToast` 组件中修改 Tailwind 类名：

```typescript
<div className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 min-w-[320px] max-w-[420px]">
  {/* 修改这些类名来自定义样式 */}
</div>
```

---

## 移动端适配

Toast 组件已经包含响应式设计，在移动端会自动调整：

```typescript
// 最小宽度：320px（适配小屏幕）
// 最大宽度：420px（避免占用过多空间）
min-w-[320px] max-w-[420px]
```

在移动端，按钮会保持横向排列，因为文字简短不会导致拥挤。

---

## 无障碍访问

Toast 组件已包含无障碍支持：

1. **关闭按钮**有 `aria-label` 属性
2. **按钮**有明确的文本标签
3. **颜色对比度**符合 WCAG 2.1 AA 标准
4. **键盘导航**支持（Tab 键切换焦点）

---

## 性能优化

### 1. 避免过多 Toast

```typescript
// 不推荐：快速连续触发多个 Toast
for (const caseId of caseIds) {
  const result = await executeCase(caseId);
  showExecutionSuccessToast({ runId: result.runId });
}

// 推荐：使用批量执行
const result = await executeBatch(caseIds);
showExecutionSuccessToast({
  runId: result.runId,
  isBatch: true,
  batchCount: caseIds.length,
});
```

---

### 2. 自动关闭

Toast 会在 6 秒后自动关闭，用户也可以手动点击关闭按钮。

---

## 测试

### 单元测试示例

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ExecutionSuccessToast } from '@/components/ui/execution-toast';

describe('ExecutionSuccessToast', () => {
  it('should render with correct title', () => {
    render(
      <ExecutionSuccessToast
        toastId="test-1"
        runId={123}
        buildUrl="https://jenkins.example.com/job/test/123"
      />
    );

    expect(screen.getByText('测试用例已开始执行')).toBeInTheDocument();
  });

  it('should navigate to record page when clicking "查看记录"', () => {
    const { container } = render(
      <ExecutionSuccessToast
        toastId="test-1"
        runId={123}
      />
    );

    const viewRecordButton = screen.getByText('查看记录');
    fireEvent.click(viewRecordButton);

    expect(window.location.href).toContain('/reports/123');
  });

  it('should open Jenkins in new tab when clicking "查看 Jenkins"', () => {
    const windowOpen = vi.spyOn(window, 'open').mockImplementation();

    render(
      <ExecutionSuccessToast
        toastId="test-1"
        runId={123}
        buildUrl="https://jenkins.example.com/job/test/123"
      />
    );

    const viewJenkinsButton = screen.getByText('查看 Jenkins');
    fireEvent.click(viewJenkinsButton);

    expect(windowOpen).toHaveBeenCalledWith(
      'https://jenkins.example.com/job/test/123',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
```

---

## 常见问题

### Q1: 为什么不直接使用 sonner 的 `action` 和 `cancel` 属性？

**A**: sonner 的 `action` 只支持一个按钮，`cancel` 主要用于取消操作而非第二个操作按钮。使用 `toast.custom()` 可以完全自定义 Toast 内容，提供更好的用户体验。

---

### Q2: Toast 是否支持堆叠显示？

**A**: 是的，sonner 支持多个 Toast 同时显示，会自动堆叠排列。

---

### Q3: 如何修改 Toast 的最大显示数量？

**A**: 在 `src/components/ui/sonner.tsx` 中修改 `Toaster` 组件的 `toastLimit` 属性：

```typescript
<Sonner
  className="toaster group"
  toastLimit={3} // 最多显示 3 个 Toast
  {...props}
/>
```

---

### Q4: 是否可以在 Toast 中显示实时进度？

**A**: 可以，但需要使用 `toast.custom()` 并结合 WebSocket 或轮询来更新 Toast 内容。这是一个高级用法，建议在长时间运行的任务中使用。

---

## 迁移清单

### 从旧版 Toast 迁移到新版

- [ ] 替换 `BaseCaseList.tsx` 中的 Toast 调用
- [ ] 替换 `Tasks.tsx` 中的 Toast 调用（如果有）
- [ ] 替换 `ReportDetail.tsx` 中的 Toast 调用（如果有）
- [ ] 更新相关的测试用例
- [ ] 测试移动端显示效果
- [ ] 测试无障碍访问
- [ ] 收集用户反馈

---

## 总结

新的 `execution-toast` 组件提供了：

✅ **更简洁的提示**：去除冗长的用例名称，避免换行
✅ **双操作按钮**：平台内部记录 + Jenkins 外部链接
✅ **更好的视觉设计**：使用图标、颜色和间距提升可读性
✅ **完整的交互**：支持关闭、点击跳转、重试等操作
✅ **响应式设计**：自动适配桌面端和移动端
✅ **无障碍支持**：符合 WCAG 标准

使用这个组件可以显著提升用户体验，建议在所有执行相关的场景中使用。
