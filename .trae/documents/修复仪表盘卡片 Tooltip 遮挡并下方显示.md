## 问题原因
- 仪表盘帮助图标使用 Radix Tooltip（@radix-ui/react-tooltip）。当前封装的 TooltipContent未通过 Portal 渲染，内容在卡片 DOM 层级内，受父级/兄弟层的叠层上下文影响，出现被卡片或相邻元素遮挡。
- 部分页面将 Tooltip 放置在图表/卡片标题的上侧（side="top"），在网格布局下更易与上方卡片产生遮挡。

## 修改方案
- 在通用封装中为 TooltipContent 增加 Portal，使内容直接挂载到 body，彻底避免被父容器裁剪或遮挡。
- 统一帮助图标的 Tooltip 默认方向为下方：默认 side="bottom"，并适度增大 sideOffset（如 8–12），保证与卡片内容有可读间距。
- 将仪表盘相关页面中显式写死为 side="top" 的位置调整为 side="bottom"，与交互预期一致。

## 具体改动
- 通用组件：在封装中使用 Tooltip.Portal 包裹 Tooltip.Content，并设置默认 props
  - 文件： [tooltip.tsx](file:///Users/wb_caijinwei/Automation_Platform/src/components/ui/tooltip.tsx#L11-L23)
  - 改动要点：
    - 将 Content 包裹到 TooltipPrimitive.Portal 内
    - 默认参数：side="bottom"，sideOffset=8（保留传入 props 的覆盖能力）
- 仪表盘：将帮助图标的 Tooltip 改为下方显示
  - 趋势图头部： [TrendChart.tsx:ChartHeader](file:///Users/wb_caijinwei/Automation_Platform/src/components/dashboard/TrendChart.tsx#L178-L192)
    - 由 side="top" 改为 side="bottom"，建议 sideOffset=12
  - 今日执行头部： [TodayExecution.tsx](file:///Users/wb_caijinwei/Automation_Platform/src/components/dashboard/TodayExecution.tsx#L162-L173) 与清除筛选按钮 [TodayExecution.tsx](file:///Users/wb_caijinwei/Automation_Platform/src/components/dashboard/TodayExecution.tsx#L174-L188)
    - 统一改为 side="bottom"，保持说明与交互一致
- 说明：统计卡片已是 bottom，无需调整： [StatsCards.tsx](file:///Users/wb_caijinwei/Automation_Platform/src/components/dashboard/StatsCards.tsx#L43-L60)

## 验证方式
- 打开仪表盘页面，分别悬停三个位置：
  - 统计卡片右上角的“?”说明
  - 趋势图标题右侧“?”说明
  - 今日执行标题和清除筛选的“?”说明
- 期望结果：Tooltip 在卡片下方弹出，不会被任何卡片或图表遮挡；滚动页面、切换暗/亮主题时显示正常。
- 兼容性：现有测试使用组件级模拟，对 Portal 的引入无影响；Recharts 的图表 Tooltip不在本次改动范围。

## 风险与回退
- 风险较低：Portal 是 Radix 官方推荐用法；z-index 已为 z-50，叠层安全。
- 如需回退：仅去除 Portal 并恢复各页面的 side 参数即可。