# GitHub 仓库管理 - 快速开始

---

## 🚀 3 步快速集成

### 步骤 1: 添加路由

编辑 `src/App.tsx`:

```typescript
import GitHubRepositoryManagement from '@/pages/GitHubRepositoryManagement';

// 在 Router 组件中的 Switch 内添加:
<Route path="/github-repositories">
  <ProtectedRoute>
    <GitHubRepositoryManagement />
  </ProtectedRoute>
</Route>
```

### 步骤 2: 添加菜单项

编辑 `src/components/Sidebar.tsx`:

```typescript
import { Github } from 'lucide-react';

// 在菜单数组中添加:
{
  label: 'GitHub 仓库',
  icon: <Github className="w-5 h-5" />,
  href: '/github-repositories',
}
```

### 步骤 3: 访问页面

```
http://localhost:5174/github-repositories
```

---

## ✨ 功能演示

### 主要功能

1. **查看仓库列表** ✅
   - 表格视图 (桌面)
   - 卡片视图 (移动)
   - 统计信息卡片

2. **添加仓库** ✅
   - 点击"新增仓库"按钮
   - 填写表单 (名称、URL 必填)
   - 点击"添加"按钮

3. **编辑仓库** ✅
   - 点击"编辑"按钮
   - 修改信息
   - 点击"更新"按钮

4. **删除仓库** ✅
   - 点击"删除"按钮
   - 确认删除
   - 仓库被删除

5. **批量删除** ✅
   - 选中多个仓库
   - 点击"删除 (n)"按钮
   - 确认删除

6. **搜索仓库** ✅
   - 输入搜索关键词
   - 实时过滤结果

7. **筛选仓库** ✅
   - 按编程语言筛选
   - 按状态筛选
   - 点击"重置筛选"清空

8. **URL 操作** ✅
   - 复制 URL 到剪贴板
   - 在新标签页打开仓库

---

## 📁 文件结构

```
src/
├── pages/
│   └── GitHubRepositoryManagement.tsx      (主页面)
├── components/
│   ├── GitHubRepositoryTable.tsx           (表格组件)
│   ├── GitHubRepositoryForm.tsx            (表单组件)
│   └── ui/
│       └── checkbox.tsx                    (复选框)
└── App.tsx                                 (路由配置)
```

---

## 🎨 组件预览

### 页面布局

```
┌─────────────────────────────────────────────────┐
│  GitHub 仓库管理        [新增仓库]              │
│  集中管理和监控自动化测试仓库                     │
├─────────────────────────────────────────────────┤
│  📦 总仓库数: 3  ✅ 活跃: 2  ⏸️ 不活跃: 1  📁 已归档: 0  │
├─────────────────────────────────────────────────┤
│  搜索: [输入搜索...]  语言: [选择]  状态: [选择]  │
├─────────────────────────────────────────────────┤
│ ☑️ │ 仓库名称    │ 描述 │ 语言 │ 状态 │ 操作    │
├────┼────────────┼─────┼──────┼──────┼────────┤
│ ☐  │ Repo 1     │ ... │ Py  │ ✅  │ 📋 🔗 ✏️ 🗑 │
│ ☐  │ Repo 2     │ ... │ JS  │ ✅  │ 📋 🔗 ✏️ 🗑 │
│ ☐  │ Repo 3     │ ... │ Ja  │ ⏸️  │ 📋 🔗 ✏️ 🗑 │
└─────────────────────────────────────────────────┘
```

### 表单布局

```
┌─────────────────────────────────────┐
│ 新增仓库                             │
├─────────────────────────────────────┤
│ 仓库名称 *: [输入仓库名称]           │
│ 编程语言:   [选择语言 ▼]            │
│ 仓库 URL *: [输入 URL]              │
│ 描述:       [多行文本框]             │
│ 状态:       [活跃 ▼]                │
│ Star 数量:  [输入数字]              │
├─────────────────────────────────────┤
│                      [取消] [添加]  │
└─────────────────────────────────────┘
```

---

## 💾 数据示例

```typescript
const repositories = [
  {
    id: '1',
    name: 'SeleniumBase-CI',
    description: 'SeleniumBase 自动化测试框架集成',
    url: 'https://github.com/example/SeleniumBase-CI',
    language: 'Python',
    status: 'active',
    stars: 156,
    lastSync: '2025-12-31',
    createdAt: '2025-01-01',
  },
  // ... 更多仓库
];
```

---

## 🎯 常见操作

### 添加仓库

```
1. 点击右上角 "新增仓库" 按钮
2. 填写表单:
   - 仓库名称: SeleniumBase-CI (必填)
   - 仓库 URL: https://github.com/example/repo (必填)
   - 编程语言: Python (可选)
   - 描述: ... (可选)
   - 状态: 活跃 (默认)
3. 点击 "添加" 按钮
4. 成功提示显示
```

### 搜索仓库

```
1. 在搜索框输入关键词
2. 列表实时过滤
3. 支持搜索: 仓库名称 + 描述
```

### 筛选仓库

```
1. 选择编程语言 (如 Python)
2. 选择状态 (如 活跃)
3. 列表自动过滤
4. 点击 "重置筛选" 清空
```

### 复制 URL

```
1. 点击仓库行的 "复制" 按钮
2. 图标变为 ✓
3. URL 已复制到剪贴板
4. 2 秒后恢复原样
```

### 打开仓库

```
1. 点击仓库行的 "打开" 按钮
2. 或点击仓库名称
3. 在新标签页打开 GitHub 仓库
```

### 编辑仓库

```
1. 点击仓库行的 "编辑" 按钮
2. 表单打开并预填数据
3. 修改需要的字段
4. 点击 "更新" 按钮
5. 成功提示显示
```

### 删除仓库

```
1. 点击仓库行的 "删除" 按钮
2. 确认对话框弹出
3. 点击 "确定" 确认
4. 仓库被删除，成功提示显示
```

### 批量删除

```
1. 选中一个或多个仓库 (复选框)
2. 点击 "删除 (n)" 按钮 (n = 选中数量)
3. 确认对话框弹出
4. 点击 "确定" 确认
5. 所有选中仓库被删除
```

---

## 🌙 深色模式

页面自动支持深色模式:

```
浅色模式: 白色背景 + 深色文字
深色模式: 深色背景 + 浅色文字
```

通过系统设置或主题切换按钮自动切换。

---

## 📱 响应式设计

### 桌面端 (≥ 768px)

- 完整的数据表格
- 所有列可见
- 悬浮效果
- 4 列统计卡片

### 平板端 (600px - 768px)

- 表格可能需要滚动
- 统计卡片 2 列显示
- 操作按钮仍可见

### 手机端 (< 600px)

- 卡片式布局
- 统计卡片 2 列显示
- 关键信息突出
- 按钮排成一行

---

## ⚙️ 配置选项

### 修改主题颜色

编辑 `src/pages/GitHubRepositoryManagement.tsx`:

```typescript
// 修改按钮颜色
<Button className="gap-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700">
```

### 修改语言列表

编辑 `src/components/GitHubRepositoryForm.tsx`:

```typescript
const languages = [
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'Go',
  'Rust',
  // 添加更多语言
];
```

### 修改状态选项

编辑组件中的状态映射:

```typescript
const getStatusLabel = (status: string) => {
  switch (status) {
    case 'active': return '活跃';
    case 'inactive': return '不活跃';
    case 'archived': return '已归档';
    // 添加更多状态
  }
};
```

---

## 🔗 集成 API

### 将本地状态替换为 API

创建 `src/api/github.ts`:

```typescript
export const githubApi = {
  // 获取仓库列表
  getRepositories: () =>
    fetch('/api/github/repositories').then(r => r.json()),

  // 创建仓库
  createRepository: (data) =>
    fetch('/api/github/repositories', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // 更新仓库
  updateRepository: (id, data) =>
    fetch(`/api/github/repositories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // 删除仓库
  deleteRepository: (id) =>
    fetch(`/api/github/repositories/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),
};
```

### 修改主页面

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { githubApi } from '@/api/github';

// 获取仓库
const { data: repositories = [], refetch } = useQuery({
  queryKey: ['github-repositories'],
  queryFn: () => githubApi.getRepositories(),
});

// 添加仓库
const addMutation = useMutation({
  mutationFn: (data) => githubApi.createRepository(data),
  onSuccess: () => refetch(),
});

// 删除仓库
const deleteMutation = useMutation({
  mutationFn: (id) => githubApi.deleteRepository(id),
  onSuccess: () => refetch(),
});
```

---

## 🧪 测试

### 本地测试

```bash
# 启动项目
npm run start

# 访问页面
http://localhost:5174/github-repositories

# 测试功能:
1. 添加仓库
2. 编辑仓库
3. 删除仓库
4. 搜索仓库
5. 筛选仓库
6. 批量删除
7. 复制 URL
8. 打开仓库
```

### 浏览器兼容性

- ✅ Chrome/Edge (最新)
- ✅ Firefox (最新)
- ✅ Safari (最新)
- ✅ 移动浏览器

---

## 📚 相关文件

- [完整指南](./GITHUB_REPO_MANAGEMENT_GUIDE.md)
- [主页面源码](./src/pages/GitHubRepositoryManagement.tsx)
- [表格组件源码](./src/components/GitHubRepositoryTable.tsx)
- [表单组件源码](./src/components/GitHubRepositoryForm.tsx)

---

## 🎉 完成！

现在你已经有了一个功能完整、UI 美观的 GitHub 仓库管理页面。

享受使用吧！🚀

---

**最后更新**: 2026-01-01  
**版本**: 1.0