# CNB CICD 快速迁移指南

## 🎯 目标

从 Jenkins/GitHub Actions 迁移到 CNB 云原生自动部署。

## ⚡ 快速操作

### 1️⃣ 停止现有服务

```bash
# 一键停止所有现有部署
bash stop-current-deployment.sh
```

### 2️⃣ 提交代码

```bash
git add .
git commit -m "Migrate to CNB CICD"
git push origin master
```

### 3️⃣ CNB 部署

1. 打开 **CatPaw IDE**
2. 点击对话框右上方的 🚀 **小火箭图标**
3. 等待部署完成
4. 获取访问链接

## 📁 关键文件

| 文件 | 作用 | 状态 |
|------|------|------|
| `.catpaw/catpaw_deploy.yaml` | CNB 部署配置 | ✅ 已创建 |
| `docs/CNB_CICD_DEPLOYMENT.md` | 详细文档 | ✅ 已创建 |
| `stop-current-deployment.sh` | 停止脚本 | ✅ 已创建 |
| `Jenkinsfile.deploy` | Jenkins 配置 | ⚠️ 已禁用触发器 |
| `.github/workflows/deploy.yml` | GitHub Actions | ⚠️ 已禁用 |

## 🔑 核心配置

### CNB 配置文件

```yaml:.catpaw/catpaw_deploy.yaml
type: cloudnative  # ⚠️ 必须是 cloudnative,不是 webstatic
node: 20
cmd:
  - npm install --production=false
  - npm run build
  - npm run server:build
target:
  - ./
runCmd:
  - node -r tsconfig-paths/register dist/server/server/index.js
ports:
  - 3000
```

## ⚠️ 注意事项

1. **首次部署前必须确保远程仓库有至少一次 push**
2. **Node 项目务必检查 type 字段为 cloudnative**
3. **数据库连接支持内网 MySQL,不支持 Zebra**
4. **默认绑定第一个端口 (3000)**

## 🔗 访问方式

```
https://plus-{projectID}.database.sankuai.com
```

- **projectID**: 部署成功后自动生成
- **其他端口**: `{域名}/port-{端口号}`

## 📊 对比

| 特性 | 旧方案 | CNB |
|------|--------|-----|
| 触发方式 | 定时/Push | Push |
| 配置复杂度 | 高 | 低 |
| 维护成本 | 高 | 低 |
| 适用场景 | 生产环境 | 测试环境 |

## 🆘 故障排查

### 部署失败

```bash
# 查看日志
curl "http://catpaw-plus.ee.test.sankuai.com/get/project/log?projectID={projectID}"
```

### 域名访问不通

- 检查 `ports` 配置
- 使用 `/port-{端口号}` 访问其他端口

### 项目类型错误

手动修改 `.catpaw/catpaw_deploy.yaml`:
```yaml
type: cloudnative  # 确保是 cloudnative
```

## 📖 详细文档

- [完整部署指南](docs/CNB_CICD_DEPLOYMENT.md)
- [CatPaw 官方文档](https://km.sankuai.com/collabpage/2723163380)
