# Toast 提示优化设计方案

## 问题分析

### 当前实现的问题
1. **标题包含完整用例名称**：当用例名称很长时会导致换行，影响美观
2. **缺少平台内部链接**：只有 Jenkins 外部链接，没有跳转到平台执行记录的链接
3. **信息层级不够清晰**：用例名称占据主要位置，但用户更关心的是操作结果和后续动作

### 代码位置
- 文件：`src/components/cases/BaseCaseList.tsx`
- 行数：183-193
- Hook：`src/hooks/useExecuteCase.ts`

---

## 优化方案对比

### 方案 1：简洁型（✅ 已实现）

**设计理念**：去除用例名称，聚焦操作结果和后续动作

**Toast 结构**：
```
┌─────────────────────────────────────┐
│ ✓ 测试用例已开始执行                │
│ 执行任务已创建，点击下方按钮查看详情 │
│                    [查看 Jenkins]   │
└─────────────────────────────────────┘
```

**优点**：
- ✅ 简洁明了，不会因用例名称过长而换行
- ✅ 信息层级清晰，突出操作结果
- ✅ 用户可以通过按钮快速跳转查看详情
- ✅ 实现简单，无需修改 Toast 组件

**缺点**：
- ❌ 无法直接看到是哪个用例在执行（但用户通常知道自己点击了哪个）
- ❌ 只有一个外部链接按钮

**适用场景**：
- 用户明确知道自己点击了哪个用例
- 执行操作是即时反馈，不需要额外确认

---

### 方案 2：截断型

**设计理念**：保留用例名称，但进行智能截断

**Toast 结构**：
```
┌─────────────────────────────────────┐
│ ✓ 已开始执行：测试用户登录功能验证… │
│ 执行任务已创建，点击查看详情        │
│         [查看记录] [查看 Jenkins]   │
└─────────────────────────────────────┘
```

**实现代码示例**：
```typescript
const truncateName = (name: string, maxLength: number = 20) => {
  return name.length > maxLength
    ? `${name.substring(0, maxLength)}…`
    : name;
};

toast.success(`已开始执行：${truncateName(caseName)}`, {
  description: '执行任务已创建，点击查看详情',
  duration: 6000,
  action: {
    label: '查看 Jenkins',
    onClick: () => window.open(result.buildUrl, '_blank')
  },
});
```

**优点**：
- ✅ 保留用例名称信息，提供更多上下文
- ✅ 通过截断避免过长换行
- ✅ 可以添加多个操作按钮

**缺点**：
- ❌ 截断后的名称可能不完整，用户仍需点击查看完整信息
- ❌ 需要确定合适的截断长度（不同屏幕尺寸可能需要不同长度）

**适用场景**：
- 用户可能同时操作多个用例，需要区分
- 用例名称有明确的命名规范，前缀能够区分

---

### 方案 3：双按钮型（🔥 推荐）

**设计理念**：提供两个操作按钮，分别跳转到平台内部和 Jenkins

**Toast 结构**：
```
┌─────────────────────────────────────┐
│ ✓ 测试用例已开始执行                │
│ 执行任务已创建，可通过以下方式查看  │
│         [查看记录] [查看 Jenkins]   │
└─────────────────────────────────────┘
```

**实现代码**：

由于 sonner 的 `toast` API 只支持一个 `action` 按钮，我们需要自定义实现双按钮：

#### 方法 A：使用 JSX 自定义内容（推荐）

```typescript
import { toast } from 'sonner';
import { ExternalLink, FileText } from 'lucide-react';

toast.custom((t) => (
  <div className="flex flex-col gap-2 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30">
        <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className="font-medium text-slate-900 dark:text-white">测试用例已开始执行</span>
    </div>
    <p className="text-sm text-slate-600 dark:text-slate-400 ml-7">
      执行任务已创建，可通过以下方式查看进度
    </p>
    <div className="flex gap-2 ml-7">
      <button
        onClick={() => {
          window.location.href = `/reports/${result.runId}`;
          toast.dismiss(t);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
      >
        <FileText className="w-3.5 h-3.5" />
        查看记录
      </button>
      {result?.buildUrl && (
        <button
          onClick={() => {
            window.open(result.buildUrl, '_blank');
            toast.dismiss(t);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          查看 Jenkins
        </button>
      )}
    </div>
  </div>
), {
  duration: 6000,
});
```

#### 方法 B：在 description 中嵌入链接

```typescript
import { Link } from 'wouter';

toast.success('测试用例已开始执行', {
  description: (
    <div className="flex flex-col gap-2">
      <p>执行任务已创建，可通过以下方式查看进度：</p>
      <div className="flex gap-2">
        <a
          href={`/reports/${result.runId}`}
          className="text-blue-600 hover:underline text-sm"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/reports/${result.runId}`;
          }}
        >
          查看记录
        </a>
        {result?.buildUrl && (
          <>
            <span className="text-slate-400">|</span>
            <a
              href={result.buildUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              查看 Jenkins
            </a>
          </>
        )}
      </div>
    </div>
  ),
  duration: 6000,
  action: undefined,
});
```

**优点**：
- ✅ 提供两个操作入口，用户可以选择查看平台记录或 Jenkins
- ✅ 信息清晰，操作明确
- ✅ 符合用户习惯（类似通知中心的多操作按钮）

**缺点**：
- ❌ 需要自定义 Toast 内容，实现复杂度较高
- ❌ 需要确保样式与平台整体风格一致

**适用场景**：
- 需要提供多个操作入口
- 用户可能需要在平台内部和外部系统之间切换

---

### 方案 4：悬浮卡片型

**设计理念**：使用更大的卡片样式，提供更多信息和操作

**Toast 结构**：
```
┌─────────────────────────────────────────────┐
│ ✓ 测试用例已开始执行                        │
│ ─────────────────────────────────────────── │
│ 用例名称：测试用户登录功能验证流程          │
│ 执行ID：#12345                              │
│ 预计耗时：约 2-3 分钟                       │
│                                             │
│ [查看实时日志] [查看记录] [查看 Jenkins]    │
└─────────────────────────────────────────────┘
```

**优点**：
- ✅ 提供完整的上下文信息
- ✅ 支持多个操作按钮
- ✅ 可以显示预计耗时等额外信息

**缺点**：
- ❌ 占用屏幕空间较大
- ❌ 实现复杂度最高
- ❌ 可能干扰用户操作

**适用场景**：
- 长时间运行的测试任务
- 需要提供丰富的上下文信息
- 用户需要实时监控执行状态

---

## 推荐方案

### 阶段 1：快速优化（✅ 已实现）
采用**方案 1：简洁型**，去除用例名称，聚焦操作结果

**实现**：
- 标题：`测试用例已开始执行`
- 描述：`执行任务已创建，点击下方按钮查看详情`
- 按钮：`查看 Jenkins`（如果有 buildUrl）

**优势**：
- 实现简单，不需要修改 Toast 组件
- 解决用例名称过长换行的问题
- 信息清晰，操作明确

### 阶段 2：功能增强（推荐）
采用**方案 3：双按钮型**，提供平台内部和外部两个操作入口

**实现步骤**：
1. 创建自定义 Toast 组件 `ExecutionToast.tsx`
2. 在 `handleRunCase` 中使用自定义组件
3. 提供跳转到平台执行记录和 Jenkins 的两个按钮

**预期效果**：
- 用户可以选择在平台内部查看记录或跳转到 Jenkins
- 提供更完整的操作路径
- 提升用户体验

### 阶段 3：体验优化（可选）
在方案 3 的基础上，添加以下功能：
1. **实时状态更新**：Toast 中显示执行进度（通过 WebSocket）
2. **快捷操作**：添加"取消执行"按钮
3. **智能提示**：根据历史执行时长显示预计耗时

---

## 其他相关页面优化建议

### 1. 任务执行页面
**位置**：`src/pages/tasks/Tasks.tsx`

**当前问题**：可能也存在类似的 Toast 提示问题

**优化建议**：统一使用相同的 Toast 提示风格

### 2. 报告详情页
**位置**：`src/pages/reports/ReportDetail.tsx`

**优化建议**：
- 添加"重新执行"按钮时，使用相同的 Toast 提示
- 提供跳转到 Jenkins 的快捷链接

### 3. 执行进度模态框
**位置**：`src/components/cases/ExecutionProgress.tsx`

**优化建议**：
- 模态框关闭后，显示 Toast 提示用户可以在哪里查看结果
- 提供快捷跳转链接

---

## 实现清单

### ✅ 已完成
- [x] 方案 1：简洁型 Toast 提示
- [x] 去除用例名称，避免换行
- [x] 保留 Jenkins 链接按钮

### 🔄 进行中
- [ ] 创建自定义 Toast 组件
- [ ] 添加平台内部记录链接
- [ ] 统一其他页面的 Toast 风格

### 📋 待规划
- [ ] 添加实时状态更新
- [ ] 添加取消执行功能
- [ ] 添加预计耗时显示
- [ ] 创建 Toast 组件库，统一管理所有提示

---

## 技术实现细节

### sonner Toast API 限制
- `toast.success()` 只支持一个 `action` 按钮
- 不支持 `cancel` 作为第二个按钮
- 需要使用 `toast.custom()` 来实现自定义内容

### 推荐的双按钮实现方式
使用 `toast.custom()` + JSX 自定义内容：

```typescript
// 创建可复用的 Toast 组件
const ExecutionSuccessToast = ({
  runId,
  buildUrl,
  onDismiss
}: {
  runId: number;
  buildUrl?: string;
  onDismiss: () => void;
}) => (
  <div className="flex flex-col gap-2 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
    {/* Toast 内容 */}
  </div>
);

// 使用
toast.custom((t) => (
  <ExecutionSuccessToast
    runId={result.runId}
    buildUrl={result.buildUrl}
    onDismiss={() => toast.dismiss(t)}
  />
), {
  duration: 6000,
});
```

---

## 用户体验考虑

### 1. 移动端适配
- Toast 宽度需要适配小屏幕
- 按钮布局需要响应式调整
- 考虑使用堆叠布局而非横向排列

### 2. 无障碍访问
- 确保按钮有明确的 aria-label
- 支持键盘导航
- 提供屏幕阅读器友好的文本

### 3. 性能优化
- 避免在 Toast 中执行重计算
- 使用 React.memo 优化自定义组件
- 合理设置 duration，避免用户错过重要信息

---

## 总结

**当前实现（方案 1）**已经解决了用例名称过长导致换行的问题，是一个快速有效的优化方案。

**下一步建议**实现方案 3（双按钮型），提供更完整的操作路径，进一步提升用户体验。

**长期规划**可以考虑建立统一的 Toast 组件库，管理所有类型的提示信息，确保平台整体风格一致。
