# 贡献指南

感谢您对 AutoTest 项目的关注！我们欢迎各种形式的贡献。

## 如何贡献

### 1. 报告问题（Bug Report）

发现问题？请通过 GitHub Issues 报告：

- 清晰描述问题
- 提供复现步骤
- 说明预期行为和实际行为
- 包含环境信息（OS、Node 版本等）

### 2. 功能建议（Feature Request）

有新想法？请提交 Issue：

- 描述功能的用途
- 说明为什么需要这个功能
- 提供可能的实现方案

### 3. 代码贡献

#### 前置条件

- Node.js >= 18.0.0
- npm >= 9.0.0
- 了解 React、TypeScript、Express

#### 开发流程

1. **Fork 项目**

```bash
git clone https://github.com/your-username/automation-platform.git
cd automation-platform
```

2. **创建功能分支**

```bash
git checkout -b feature/your-feature-name
```

3. **安装依赖**

```bash
npm install
```

4. **启动开发环境**

```bash
npm run start
```

5. **进行修改**

- 遵循项目的代码规范（见 CLAUDE.md）
- 添加必要的测试
- 更新相关文档

6. **提交更改**

```bash
git add .
git commit -m "feat: add your feature description"
git push origin feature/your-feature-name
```

7. **创建 Pull Request**

- 清晰描述修改内容
- 链接相关的 Issue
- 确保通过所有检查

## 代码规范

遵循 [CLAUDE.md](../CLAUDE.md) 中的规范：

- ✅ 使用 TypeScript
- ✅ 禁止使用 `any` 类型
- ✅ 使用路径别名
- ✅ React 函数组件 + hooks
- ✅ 遵循命名约定

## 分支命名规范

```
feature/      - 新功能
bugfix/       - 修复 bug
docs/         - 文档更新
refactor/     - 代码重构
test/         - 测试相关
```

## Commit 信息规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type**:
- feat - 新功能
- fix - 修复 bug
- docs - 文档更新
- style - 代码风格
- refactor - 代码重构
- perf - 性能优化
- test - 测试相关
- chore - 构建、依赖更新

**示例**:
```
feat(dashboard): add real-time execution stats

Add real-time statistics display on dashboard
- Fetch execution data every 30 seconds
- Display success rate trend chart
- Show running tasks count

Closes #123
```

## 项目结构

在提交代码前，请了解项目结构：

- `src/` - 前端源代码
- `server/` - 后端源代码
- `deployment/` - 部署文件
- `docs/` - 文档

详见 [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md)

## 测试

提交代码前请进行测试：

```bash
# 前端类型检查
npx tsc --noEmit -p tsconfig.json

# 后端类型检查
npx tsc --noEmit -p tsconfig.server.json

# 启动开发环境测试
npm run start
```

## 文档

- 更新 README.md 中的相关内容
- 为新功能添加注释
- 更新 CLAUDE.md 中的开发规范

## 审查流程

1. 至少一名维护者审查代码
2. 通过所有检查和测试
3. 代码质量满足项目标准
4. 获得批准后合并

## 许可证

通过提交代码，您同意您的贡献在 MIT 许可证下发布。

## 联系方式

- 提问：通过 GitHub Issues
- 讨论：通过 GitHub Discussions
- 其他：查看 README.md

感谢您的贡献！🙏