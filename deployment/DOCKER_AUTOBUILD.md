# Docker 自动构建说明

## GitHub Actions 自动构建

项目配置了 GitHub Actions 工作流，会在每次推送到 `master` 分支时自动构建并推送 Docker 镜像。

### 工作流配置

**文件位置**: `.github/workflows/docker-image.yml`

**触发条件**:
- ✅ 推送到 `master` 分支
- ✅ 手动触发 (workflow_dispatch)
- ❌ 排除 `.md` 文件、`.github/` 和 `docs/` 目录的更改

**构建平台**:
- Linux amd64
- Linux arm64 (Apple Silicon/ARM 服务器)

**镜像仓库**:
- GitHub Container Registry (GHCR): `ghcr.io/<your-username>/automation-platform`

### 镜像标签

工作流会自动生成以下标签：
- `latest` - 最新版本（仅 master 分支）
- `<sha>` - Git commit SHA
- `master` - 分支名称

### 使用镜像

#### 拉取镜像

```bash
# 登录到 GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin

# 拉取最新镜像
docker pull ghcr.io/<username>/automation-platform:latest

# 拉取特定版本
docker pull ghcr.io/<username>/automation-platform:<sha>
```

#### 运行镜像

```bash
docker run -d \
  --name automation-platform \
  -p 3000:3000 \
  -e NODE_ENV=production \
  ghcr.io/<username>/automation-platform:latest
```

#### Docker Compose

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/<username>/automation-platform:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

### 手动触发构建

1. 进入 GitHub 仓库页面
2. 点击 "Actions" 标签
3. 选择 "Build and Push Docker Image" 工作流
4. 点击 "Run workflow" 按钮
5. 选择分支并点击 "Run workflow"

### 环境变量

如果需要环境变量，可以在 GitHub Actions Secrets 中配置：

1. 进入仓库 Settings
2. Secrets and variables > Actions
3. 点击 "New repository secret"
4. 添加所需的环境变量

常用环境变量：
- `DB_HOST` - 数据库主机
- `DB_PORT` - 数据库端口
- `DB_USER` - 数据库用户
- `DB_PASSWORD` - 数据库密码
- `DB_NAME` - 数据库名称
- `JWT_SECRET` - JWT 密钥

### 构建日志

查看构建日志：
1. 进入 GitHub Actions
2. 选择最近的 "Build and Push Docker Image" 运行
3. 查看构建步骤和输出

### 故障排查

#### 构建失败
- 检查 `deployment/Dockerfile` 语法
- 查看构建日志中的错误信息
- 确保 `package.json` 和 `package-lock.json` 一致

#### 推送失败
- 检查 GitHub Token 权限
- 确保仓库设置为 Public 或你有访问权限

#### 运行失败
- 检查环境变量配置
- 查看容器日志：`docker logs <container-id>`
- 检查端口是否被占用

### 性能优化

工作流使用了 GitHub Actions Cache 来加速构建：
- `cache-from: type=gha` - 从缓存加载
- `cache-to: type=gha,mode=max` - 保存到缓存

这可以显著减少后续构建时间。

### 最佳实践

1. **不要手动修改镜像标签** - 使用工作流自动生成的标签
2. **使用特定 SHA 标签部署** - 确保可重现的部署
3. **定期清理旧镜像** - 节省存储空间
4. **监控镜像大小** - 优化 Dockerfile 和依赖
5. **使用 .dockerignore** - 排除不必要的文件

### 自定义配置

#### 推送到 Docker Hub

如果需要推送到 Docker Hub，修改 `.github/workflows/docker-image.yml`:

```yaml
- name: Log in to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKER_USERNAME }}
    password: ${{ secrets.DOCKER_PASSWORD }}

- name: Extract metadata
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: <username>/automation-platform
```

然后添加 Secrets:
- `DOCKER_USERNAME` - Docker Hub 用户名
- `DOCKER_PASSWORD` - Docker Hub 密码或访问令牌

#### 单平台构建

如果只需要单一平台，修改构建步骤：

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    context: .
    file: deployment/Dockerfile
    platforms: linux/amd64  # 只构建 amd64
    push: true
    tags: ${{ steps.meta.outputs.tags }}
```

### 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Docker Buildx 文档](https://docs.docker.com/buildx/working-with-buildx/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
