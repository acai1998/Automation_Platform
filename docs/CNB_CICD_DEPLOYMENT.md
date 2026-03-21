# CNB CICD 自动部署指南

## 📋 概述

本文档说明如何使用 CNB (CatPaw) 的云原生构建部署功能实现自动化部署,替代原有的 Jenkins 和 GitHub Actions 方案。

## 🔄 迁移步骤

### 1. 停止现有部署服务

#### 1.1 停止 Jenkins 定时构建

在 Jenkins 控制台操作:
```bash
# 方式一: 在 Jenkins Web UI 中
# 进入任务配置页面 -> 取消勾选 "定时构建" 触发器

# 方式二: 删除触发器配置
# 编辑 Jenkinsfile.deploy,注释或删除 triggers 部分:
# triggers {
#     cron('0 0,4,8,12,16,20 * * *')
# }
```

#### 1.2 停止 GitHub Actions 自动部署

```bash
# 方式一: 删除 GitHub Actions 配置文件
rm .github/workflows/deploy.yml

# 方式二: 禁用 workflow (在 GitHub Web UI)
# 进入仓库 Settings -> Actions -> General
# 在 "Actions permissions" 中选择 "Disable actions"
```

#### 1.3 停止服务器上的 PM2 进程(可选)

```bash
# SSH 登录服务器
ssh user@your-server

# 停止服务
pm2 stop autotest-platform
pm2 save

# 或者完全删除 PM2 进程
pm2 delete autotest-platform
pm2 save
```

### 2. 配置 CNB 自动部署

#### 2.1 配置文件说明

CNB 使用 `.catpaw/catpaw_deploy.yaml` 配置文件:

```yaml
# 项目类型
type: cloudnative  # cloudnative(云原生项目) / webstatic(静态资源项目)

# Node.js 版本 (只需要大版本号)
node: 20

# 构建命令
cmd:
  - npm install --production=false
  - npm run build          # 构建前端
  - npm run server:build   # 构建后端

# 构建产物目录
target:
  - ./  # 打包所有内容,确保 package.json 存在

# 运行命令
runCmd:
  - node -r tsconfig-paths/register dist/server/server/index.js

# 服务端口
ports:
  - 3000
```

#### 2.2 关键配置说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `type` | 项目类型,Node.js 后端必须为 `cloudnative` | `cloudnative` |
| `node` | Node 版本,支持 16/18/20/22 | `20` |
| `cmd` | 构建命令列表 | `npm install`, `npm run build` |
| `target` | 构建产物目录 | `./` (打包所有文件) |
| `runCmd` | 运行命令 | `node dist/server/server/index.js` |
| `ports` | 服务端口列表 | `3000` |

#### 2.3 环境变量配置

CNB 支持在运行时注入环境变量,方式有两种:

**方式一: 在 CatPaw IDE 中配置**
1. 打开 CatPaw IDE
2. 进入项目设置
3. 配置环境变量

**方式二: 使用 Lion 配置中心**
```bash
# 在 runCmd 前添加 Lion 配置
runCmd:
  - mkdir -p /data/webapps && echo -e "zkserver=lion-zk.vip.sankuai.com:2181\n\nenv=prod\ndeployenv=product\naz=hh\nregion=beijing\nbuilding=HH-M1" > /data/webapps/appenv
  - node -r tsconfig-paths/register dist/server/server/index.js
```

### 3. 使用 CNB 部署

#### 3.1 首次部署

1. **确保代码已推送到远程仓库**
   ```bash
   git add .
   git commit -m "Add CNB deployment config"
   git push origin master
   ```

2. **在 CatPaw IDE 中部署**
   - 点击对话框右上方的小火箭图标 🚀
   - 等待构建和部署完成
   - 成功后会显示访问链接

#### 3.2 自动部署流程

配置完成后,后续每次代码更新会自动触发部署:

```
代码推送 → CNB 自动构建 → 自动部署 → 服务更新
```

**工作原理:**
- CNB 自动监听仓库的代码变更
- 检测到新提交后自动触发构建
- 构建成功后自动部署到测试环境
- 无需手动操作

#### 3.3 访问部署的服务

部署成功后,CNB 会提供一个访问域名:

```
https://plus-{projectID}.database.sankuai.com
```

- 默认绑定配置文件中的第一个端口 (3000)
- 如需访问其他端口: `https://plus-{projectID}.database.sankuai.com/port-{端口号}`

### 4. 数据库连接配置

CNB 云原生部署环境支持连接内网数据库:

```yaml
# 方式一: 使用环境变量 (推荐)
# 在 CatPaw IDE 中配置环境变量

# 方式二: 使用 Lion 配置中心
runCmd:
  - mkdir -p /data/webapps && echo -e "zkserver=lion-zk.vip.sankuai.com:2181\n\nenv=prod\ndeployenv=product\naz=hh\nregion=beijing\nbuilding=HH-M1" > /data/webapps/appenv
  - node -r tsconfig-paths/register dist/server/server/index.js
```

**数据库连接方式:**
- 支持原生 MySQL 连接
- 暂不支持 Zebra 连接池
- 网络已与机房线上内网连通

### 5. 查看日志

#### 5.1 实时日志

```bash
# 通过 API 获取最新 50 行日志
curl "http://catpaw-plus.ee.test.sankuai.com/get/project/log?projectID={projectID}"

# projectID 是域名中 plus- 后的部分
# 例如: https://plus-1c81a1f1-b0a2-45bc-bf33-a7637ce35724.database.sankuai.com
# projectID = 1c81a1f1-b0a2-45bc-bf33-a7637ce35724
```

#### 5.2 构建日志

在 CatPaw IDE 中点击部署任务链接查看详细构建日志。

### 6. 故障排查

#### 6.1 部署失败: patch does not apply

**原因:** CNB 工作区同步对二进制/新增文件支持不完善

**解决:**
```bash
# 手动 commit 并 push
git add .
git commit -m "Fix deployment"
git push origin master
```

#### 6.2 域名访问不通

**原因:** 端口配置问题

**解决:**
- 检查 `catpaw_deploy.yaml` 中 `ports` 配置
- 默认绑定第一个端口
- 其他端口使用 `/port-{端口号}` 访问

#### 6.3 Node 项目被识别为 webstatic

**原因:** CNB 容易将 Node 项目误判为静态项目

**解决:**
手动检查 `.catpaw/catpaw_deploy.yaml`,确保 `type: cloudnative`

### 7. 与原有方案对比

| 特性 | Jenkins | GitHub Actions | CNB CICD |
|------|---------|----------------|----------|
| 自动触发 | ✅ 定时触发 | ✅ Push 触发 | ✅ Push 触发 |
| 部署环境 | 自建服务器 | 自建服务器 | 云原生环境 |
| 配置复杂度 | 高 | 中 | 低 |
| 维护成本 | 高 | 中 | 低 |
| 访问方式 | 固定域名 | 固定域名 | 动态域名 |
| 数据库连接 | 直连 | 直连 | 内网连通 |
| 适用场景 | 生产环境 | 生产环境 | 测试环境 |

### 8. 最佳实践建议

1. **测试环境使用 CNB**
   - 快速迭代开发
   - 自动化部署
   - 低维护成本

2. **生产环境继续使用 Jenkins/GitHub Actions**
   - 固定域名访问
   - 更可控的部署流程
   - 生产级稳定性

3. **环境隔离**
   - 测试环境: CNB 云原生
   - 生产环境: 自建服务器 + PM2

### 9. 注意事项

⚠️ **重要提示:**

1. **首次部署前必须确保远程仓库有至少一次 push**
   ```bash
   git push origin master
   ```

2. **Node 项目务必检查 type 字段为 cloudnative**
   ```yaml
   type: cloudnative  # 不是 webstatic!
   ```

3. **CNB 当前暂不支持 monorepo 模式**
   - 前后端共用仓库可能有兼容性问题
   - 建议拆分为独立仓库

4. **环境变量敏感信息**
   - 不要将密码等敏感信息硬编码在配置文件中
   - 使用 CatPaw IDE 的环境变量配置功能

### 10. 参考文档

- [CatPaw 构建部署使用手册](https://km.sankuai.com/collabpage/2723163380)
- [CNB 云原生构建规范](https://km.sankuai.com/page/13945939)
- [Lion HTTP 接口接入指南](https://km.sankuai.com/collabpage/247849528)
