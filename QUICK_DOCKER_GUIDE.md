# Docker 自动构建快速参考

## 🚀 自动构建流程

### 推送触发
```bash
git add .
git commit -m "your message"
git push github master
```

推送后自动触发 GitHub Actions 构建 Docker 镜像。

## 📦 镜像仓库

**位置**: `ghcr.io/acai1998/automation-platform`

**标签**:
- `latest` - 最新版本
- `<sha>` - 提交 SHA
- `master` - 分支名称

## 🔧 本地构建（开发时）

```bash
# 构建镜像
docker build -f deployment/Dockerfile -t automation-platform .

# 运行容器
docker run -d -p 3000:3000 --name app automation-platform
```

## 📥 拉取并运行已构建的镜像

```bash
# 拉取最新镜像
docker pull ghcr.io/acai1998/automation-platform:latest

# 运行
docker run -d -p 3000:3000 ghcr.io/acai1998/automation-platform:latest
```

## 📊 监控构建

1. 访问 https://github.com/acai1998/Automation_Platform/actions
2. 查看 "Build and Push Docker Image" 工作流
3. 查看构建状态和日志

## 🎯 工作流特性

- ✅ 自动触发：推送代码到 master 分支
- ✅ 多平台：支持 amd64 和 arm64
- ✅ 缓存优化：使用 GitHub Actions Cache 加速构建
- ✅ 手动触发：支持手动触发构建
- ✅ 智能标签：自动生成版本标签
- ✅ 文档过滤：排除文档更新触发构建

## 🐛 故障排查

### 构建失败
查看 Actions 日志，检查：
- Dockerfile 语法
- 依赖安装
- 构建错误

### 镜像推送失败
检查：
- GitHub Token 权限
- 仓库设置（公开/私有）
- 网络连接

## 📝 文档

详细文档请参考：`deployment/DOCKER_AUTOBUILD.md`

## 🔄 相关命令

```bash
# 查看镜像列表
docker images | grep automation-platform

# 查看运行中的容器
docker ps | grep automation-platform

# 查看容器日志
docker logs <container-id>

# 停止容器
docker stop <container-name>

# 删除容器
docker rm <container-name>

# 删除镜像
docker rmi <image-id>
```
