# PRD: 任务管理功能增强

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 任务管理功能增强 PRD |
| 版本 | v1.0 |
| 创建日期 | 2025-03-12 |
| 最后更新 | 2025-03-12 |
| 负责人 | 产品团队 |
| 状态 | 待评审 |

---

## 一、文档概述

### 1.1 背景

基于对 Tasks 页面的全面代码审查，我们识别出多个可以进一步提升用户体验和系统效率的优化方向。本 PRD 旨在规划任务管理模块的下一阶段功能增强，提升平台的易用性、性能和可维护性。

### 1.2 目标

1. **提升用户体验**：通过乐观更新和批量操作减少等待时间，提高操作效率
2. **优化性能**：针对大数据量场景进行性能优化
3. **增强可维护性**：支持国际化，便于产品全球化
4. **提高测试覆盖率**：补充端到端测试，确保功能稳定性

### 1.3 适用范围

本 PRD 适用于自动化测试平台的任务管理模块，涉及前端、后端和测试等多个领域。

---

## 二、需求详情

### 2.1 优先级定义

| 优先级 | 说明 | 开发周期 |
|--------|------|----------|
| P0 | 核心功能，必须实现 | Sprint 1 |
| P1 | 重要功能，建议实现 | Sprint 2 |
| P2 | 优化功能，可选实现 | Sprint 3 |

---

## 三、功能需求

### 需求 1：乐观更新（Optimistic Updates）

**优先级**：P0
**预计工期**：3-5 天

#### 3.1.1 需求描述

在用户执行状态切换、删除等操作时，立即在 UI 层面更新，无需等待服务器响应，提升用户体验。如果服务器返回错误，则回滚到之前的状态。

#### 3.1.2 用户故事

**作为** 测试管理员
**我想要** 在点击"暂停任务"后立即看到状态变化
**以便** 快速确认操作已执行，无需等待网络延迟

#### 3.1.3 功能场景

**场景 1：任务状态切换**
- 用户点击"暂停任务"按钮
- UI 立即显示任务状态为"已暂停"
- 后台异步发送请求到服务器
- 如果请求成功，保持当前状态
- 如果请求失败，回滚到"活跃"状态并显示错误提示

**场景 2：任务删除**
- 用户确认删除任务
- UI 立即从列表中移除该任务
- 后台异步发送删除请求
- 如果请求失败，恢复任务到列表并显示错误提示

#### 3.1.4 技术实现要点

```typescript
// 示例：乐观更新实现
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const response = await fetch(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('更新失败');
      return response.json();
    },
    onMutate: async ({ id, status }) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // 保存当前数据快照
      const previousData = queryClient.getQueryData(['tasks']);

      // 乐观更新
      queryClient.setQueryData(['tasks'], (old: any) => ({
        ...old,
        data: old.data.map((task: Task) =>
          task.id === id ? { ...task, status } : task
        ),
      }));

      return { previousData };
    },
    onError: (err, variables, context) => {
      // 回滚到之前的状态
      if (context?.previousData) {
        queryClient.setQueryData(['tasks'], context.previousData);
      }
      toast.error('操作失败', { description: err.message });
    },
    onSuccess: () => {
      toast.success('操作成功');
    },
  });
}
```

#### 3.1.5 验收标准

- [ ] 状态切换操作在 UI 上立即响应（< 100ms）
- [ ] 删除操作在 UI 上立即响应（< 100ms）
- [ ] 网络错误时能正确回滚状态
- [ ] 显示清晰的错误提示
- [ ] 不影响其他并发操作

---

### 需求 2：批量操作

**优先级**：P1
**预计工期**：5-7 天

#### 3.2.1 需求描述

支持批量选择任务并执行批量操作（启用、暂停、删除），提高操作效率，特别是在管理大量任务时。

#### 3.2.2 用户故事

**作为** 测试管理员
**我想要** 一次性暂停多个任务
**以便** 快速进行系统维护，无需逐个操作

#### 3.2.3 功能场景

**场景 1：批量选择**
- 用户进入任务列表页面
- 列表顶部显示"批量操作"复选框
- 用户勾选多个任务
- 顶部显示已选择数量和批量操作按钮

**场景 2：批量启用/暂停**
- 用户选择 5 个任务
- 点击"批量暂停"按钮
- 系统显示确认对话框："确定要暂停 5 个任务吗？"
- 用户确认后，系统批量更新状态
- 显示进度提示："正在暂停 5 个任务... (3/5 完成)"
- 操作完成后显示结果："成功暂停 4 个任务，1 个失败"

**场景 3：批量删除**
- 用户选择 3 个任务
- 点击"批量删除"按钮
- 系统显示确认对话框，列出即将删除的任务名称
- 用户确认后执行删除
- 显示操作结果

#### 3.2.4 UI 设计

```
┌─────────────────────────────────────────────────────────┐
│ 任务管理                                    [新建任务]   │
├─────────────────────────────────────────────────────────┤
│ [✓] 全选  已选择 3 个任务                               │
│ [批量启用] [批量暂停] [批量删除]                        │
├─────────────────────────────────────────────────────────┤
│ [✓] 任务 A - 活跃                                       │
│ [✓] 任务 B - 暂停                                       │
│ [ ] 任务 C - 活跃                                       │
│ [✓] 任务 D - 活跃                                       │
└─────────────────────────────────────────────────────────┘
```

#### 3.2.5 技术实现要点

**前端实现**：
```typescript
// 批量操作状态管理
const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
const [isBatchMode, setIsBatchMode] = useState(false);

// 批量更新 Hook
export function useBatchUpdateTaskStatus() {
  return useMutation({
    mutationFn: async ({ taskIds, status }: { taskIds: number[]; status: string }) => {
      const results = await Promise.allSettled(
        taskIds.map(id =>
          fetch(`/api/tasks/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          })
        )
      );

      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;

      return { successes, failures, total: taskIds.length };
    },
  });
}
```

**后端实现**：
```typescript
// 批量更新接口
router.patch('/batch/status', generalAuthRateLimiter, async (req, res) => {
  const { taskIds, status } = req.body;

  // 参数验证
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ message: 'taskIds 必须是非空数组' });
  }

  if (taskIds.length > 100) {
    return res.status(400).json({ message: '单次最多更新 100 个任务' });
  }

  // 批量更新
  const pool = getPool();
  const placeholders = taskIds.map(() => '?').join(',');
  await pool.execute(
    `UPDATE Auto_TestCaseTasks SET status = ? WHERE id IN (${placeholders})`,
    [status, ...taskIds]
  );

  res.json({ success: true, updated: taskIds.length });
});
```

#### 3.2.6 验收标准

- [ ] 支持全选/反选功能
- [ ] 显示已选择任务数量
- [ ] 批量操作有确认对话框
- [ ] 显示操作进度（针对大批量操作）
- [ ] 显示操作结果统计（成功/失败数量）
- [ ] 单次批量操作限制在 100 个任务以内
- [ ] 批量操作失败时有清晰的错误提示

---

### 需求 3：虚拟滚动优化

**优先级**：P1
**预计工期**：3-4 天

#### 3.3.1 需求描述

当任务列表数量超过 100 条时，使用虚拟滚动技术优化渲染性能，避免页面卡顿。

#### 3.3.2 用户故事

**作为** 拥有大量任务的用户
**我想要** 流畅地浏览任务列表
**以便** 快速找到目标任务，不受列表长度影响

#### 3.3.3 功能场景

**场景 1：大数据量列表**
- 用户有 500 个任务
- 打开任务列表页面
- 系统只渲染可见区域的 ~20 个任务卡片
- 用户向下滚动时，动态渲染新的任务卡片
- 滚动体验流畅，无明显延迟

#### 3.3.4 技术实现要点

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function Tasks() {
  const parentRef = useRef<HTMLDivElement>(null);

  // 虚拟滚动配置
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 350, // 估算每个任务卡片高度
    overscan: 5, // 预渲染上下各 5 个
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const task = tasks[virtualItem.index];
          return (
            <div
              key={task.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TaskCard task={task} {...handlers} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

#### 3.3.5 性能目标

| 指标 | 当前 | 目标 | 改进 |
|------|------|------|------|
| 初始渲染时间（100条） | ~800ms | < 200ms | 75% ↓ |
| 滚动帧率（500条） | ~30 FPS | > 55 FPS | 83% ↑ |
| 内存占用（1000条） | ~150MB | < 50MB | 67% ↓ |

#### 3.3.6 验收标准

- [ ] 列表超过 100 条时自动启用虚拟滚动
- [ ] 滚动流畅，帧率 > 55 FPS
- [ ] 初始渲染时间 < 200ms
- [ ] 支持搜索和筛选功能
- [ ] 兼容现有的卡片布局和交互

---

### 需求 4：国际化支持

**优先级**：P2
**预计工期**：5-7 天

#### 3.4.1 需求描述

支持多语言切换（中文、英文），为产品全球化做准备。基于现有的消息常量文件，实现国际化框架。

#### 3.4.2 用户故事

**作为** 国际用户
**我想要** 使用英文界面
**以便** 更好地理解和使用系统功能

#### 3.4.3 支持语言

- 简体中文（zh-CN）- 默认
- 英语（en-US）

#### 3.4.4 技术实现要点

**方案选择**：使用 `react-i18next`

**目录结构**：
```
src/
├── locales/
│   ├── zh-CN/
│   │   ├── common.json
│   │   ├── tasks.json
│   │   └── messages.json
│   └── en-US/
│       ├── common.json
│       ├── tasks.json
│       └── messages.json
├── i18n/
│   └── config.ts
```

**实现示例**：
```typescript
// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from '../locales/zh-CN';
import enUS from '../locales/en-US';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': zhCN,
      'en-US': enUS,
    },
    lng: localStorage.getItem('language') || 'zh-CN',
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

```typescript
// src/locales/zh-CN/tasks.json
{
  "title": "任务管理",
  "subtitle": "调度、执行和监控自动化测试任务",
  "btnCreate": "新建任务",
  "btnRunNow": "立即运行",
  "btnRunning": "执行中...",
  "statsTotal": "总任务数",
  "statsActive": "活跃任务",
  "statsTodayRuns": "今日运行"
}
```

```typescript
// src/locales/en-US/tasks.json
{
  "title": "Task Management",
  "subtitle": "Schedule, execute, and monitor automated test tasks",
  "btnCreate": "Create Task",
  "btnRunNow": "Run Now",
  "btnRunning": "Running...",
  "statsTotal": "Total Tasks",
  "statsActive": "Active Tasks",
  "statsTodayRuns": "Today's Runs"
}
```

**使用示例**：
```typescript
import { useTranslation } from 'react-i18next';

function Tasks() {
  const { t } = useTranslation('tasks');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <Button>{t('btnCreate')}</Button>
    </div>
  );
}
```

**语言切换组件**：
```typescript
function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Globe className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => changeLanguage('zh-CN')}>
          简体中文
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLanguage('en-US')}>
          English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

#### 3.4.5 迁移计划

**阶段 1：基础设施搭建（1 天）**
- 安装 `react-i18next` 和相关依赖
- 配置 i18n 框架
- 创建语言文件目录结构

**阶段 2：翻译文件准备（2 天）**
- 从 `src/constants/messages.ts` 提取所有文本
- 创建中文翻译文件（zh-CN）
- 创建英文翻译文件（en-US）
- 审核翻译质量

**阶段 3：代码迁移（2-3 天）**
- 更新 Tasks 页面使用 `useTranslation`
- 更新其他相关页面
- 移除硬编码的文本

**阶段 4：测试和优化（1 天）**
- 功能测试
- 语言切换测试
- 性能测试

#### 3.4.6 验收标准

- [ ] 支持中英文切换
- [ ] 语言切换后立即生效，无需刷新
- [ ] 用户选择的语言持久化保存
- [ ] 所有用户可见文本都已翻译
- [ ] 翻译准确、符合语境
- [ ] 不影响现有功能
- [ ] 语言切换不影响性能

---

### 需求 5：端到端测试

**优先级**：P2
**预计工期**：5-7 天

#### 3.5.1 需求描述

使用 Playwright 或 Cypress 编写端到端测试，覆盖关键用户流程，确保功能稳定性。

#### 3.5.2 测试场景

**场景 1：任务创建流程**
```typescript
test('should create a new task successfully', async ({ page }) => {
  // 1. 访问任务列表页
  await page.goto('/tasks');

  // 2. 点击"新建任务"
  await page.click('text=新建任务');

  // 3. 填写表单
  await page.fill('input[name="name"]', 'E2E Test Task');
  await page.fill('textarea[name="description"]', 'This is a test task');
  await page.click('text=手动触发');

  // 4. 提交表单
  await page.click('text=创建任务');

  // 5. 验证任务已创建
  await expect(page.locator('text=E2E Test Task')).toBeVisible();
  await expect(page.locator('text=任务创建成功')).toBeVisible();
});
```

**场景 2：任务状态切换**
```typescript
test('should toggle task status', async ({ page }) => {
  await page.goto('/tasks');

  // 找到第一个活跃任务
  const taskCard = page.locator('[data-testid="task-card"]').first();
  await expect(taskCard.locator('text=活跃')).toBeVisible();

  // 打开操作菜单
  await taskCard.locator('[data-testid="task-menu"]').click();

  // 点击暂停
  await page.click('text=暂停任务');

  // 验证状态已更新
  await expect(taskCard.locator('text=暂停')).toBeVisible();
  await expect(page.locator('text=任务已暂停')).toBeVisible();
});
```

**场景 3：任务搜索和筛选**
```typescript
test('should filter tasks by status', async ({ page }) => {
  await page.goto('/tasks');

  // 点击"活跃"筛选
  await page.click('text=活跃');

  // 验证只显示活跃任务
  const taskCards = page.locator('[data-testid="task-card"]');
  const count = await taskCards.count();

  for (let i = 0; i < count; i++) {
    await expect(taskCards.nth(i).locator('text=活跃')).toBeVisible();
  }
});
```

**场景 4：任务删除流程**
```typescript
test('should delete a task', async ({ page }) => {
  await page.goto('/tasks');

  const taskCard = page.locator('text=E2E Test Task').first();
  const taskName = await taskCard.textContent();

  // 打开操作菜单
  await taskCard.locator('[data-testid="task-menu"]').click();
  await page.click('text=删除任务');

  // 确认删除
  await expect(page.locator('text=确认删除任务')).toBeVisible();
  await page.click('text=确认删除');

  // 验证任务已删除
  await expect(page.locator(`text=${taskName}`)).not.toBeVisible();
  await expect(page.locator('text=已删除')).toBeVisible();
});
```

#### 3.5.3 测试覆盖目标

| 测试类型 | 覆盖率目标 | 当前 |
|---------|-----------|------|
| 关键路径 | 100% | 0% |
| 用户交互 | 80% | 0% |
| 错误场景 | 60% | 0% |

#### 3.5.4 技术实现

**测试框架选择**：Playwright（推荐）

**配置文件**：
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test_case/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

#### 3.5.5 验收标准

- [ ] 覆盖所有关键用户流程
- [ ] 测试可在 CI/CD 中自动运行
- [ ] 测试失败时生成截图和视频
- [ ] 测试执行时间 < 5 分钟
- [ ] 测试稳定性 > 95%（减少 flaky tests）

---

## 四、非功能性需求

### 4.1 性能要求

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 页面加载时间 | < 2s | 首屏加载（包含 100 条任务） |
| 操作响应时间 | < 100ms | 乐观更新响应时间 |
| 批量操作时间 | < 5s | 批量更新 50 个任务 |
| 虚拟滚动帧率 | > 55 FPS | 滚动流畅度 |

### 4.2 兼容性要求

- **浏览器**：Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **屏幕分辨率**：1280x720 及以上
- **移动端**：响应式设计，支持平板和手机

### 4.3 安全要求

- 批量操作需要二次确认
- 敏感操作（删除）需要权限验证
- 防止 CSRF 攻击
- API 请求限流

### 4.4 可用性要求

- 操作反馈及时（< 100ms）
- 错误提示清晰易懂
- 支持键盘快捷键
- 符合 WCAG 2.1 AA 级无障碍标准

---

## 五、实施计划

### 5.1 开发排期

| Sprint | 功能 | 工期 | 负责人 |
|--------|------|------|--------|
| Sprint 1 | 乐观更新 | 3-5 天 | 前端开发 |
| Sprint 2 | 批量操作 + 虚拟滚动 | 8-11 天 | 前后端开发 |
| Sprint 3 | 国际化 + E2E 测试 | 10-14 天 | 全栈开发 + 测试 |

**总计**：约 21-30 天（3-4 个 Sprint）

### 5.2 里程碑

| 日期 | 里程碑 | 交付物 |
|------|--------|--------|
| Week 1 | 完成乐观更新 | 代码 + 单元测试 |
| Week 2-3 | 完成批量操作和虚拟滚动 | 代码 + 接口文档 + 测试 |
| Week 4-5 | 完成国际化和 E2E 测试 | 翻译文件 + E2E 测试套件 |
| Week 5 | 上线准备 | 部署文档 + 用户手册 |

### 5.3 风险评估

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 乐观更新回滚逻辑复杂 | 中 | 中 | 提前设计状态管理方案，编写详细测试用例 |
| 虚拟滚动与现有布局冲突 | 低 | 高 | 先在独立分支验证，保留降级方案 |
| 国际化翻译质量不佳 | 中 | 低 | 邀请母语者审核翻译 |
| E2E 测试不稳定 | 高 | 中 | 使用 Playwright 的 auto-wait 机制，增加重试逻辑 |

---

## 六、验收标准

### 6.1 功能验收

- [ ] 所有 P0 功能已实现并通过测试
- [ ] 所有 P1 功能已实现并通过测试
- [ ] 所有用户故事的验收标准已满足

### 6.2 质量验收

- [ ] 代码覆盖率 > 80%
- [ ] E2E 测试覆盖率 > 60%
- [ ] 无 P0/P1 级别的 Bug
- [ ] 性能指标达标

### 6.3 文档验收

- [ ] API 文档已更新
- [ ] 用户手册已更新
- [ ] 开发者文档已更新
- [ ] 国际化翻译文件已审核

---

## 七、附录

### 7.1 参考资料

- [TanStack Query - Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [TanStack Virtual](https://tanstack.com/virtual/latest)
- [react-i18next Documentation](https://react.i18next.com/)
- [Playwright Documentation](https://playwright.dev/)

### 7.2 相关文档

- [Tasks 代码审查报告](../code-review/Tasks_Review_Report.md)
- [任务管理 API 文档](./API_DOCUMENTATION.md)
- [项目开发规范](../CLAUDE.md)

### 7.3 变更记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| v1.0 | 2025-03-12 | 初始版本 | 产品团队 |

---

## 八、审批

| 角色 | 姓名 | 审批意见 | 日期 |
|------|------|----------|------|
| 产品经理 | | | |
| 技术负责人 | | | |
| 测试负责人 | | | |
| 项目经理 | | | |

---

**文档结束**
