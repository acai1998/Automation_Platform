# 部署检查清单

## 📋 部署前检查

### 服务器环境
- [ ] Docker 已安装 (`docker --version`)
- [ ] Docker Compose 已安装 (`docker-compose --version`)
- [ ] Nginx 已安装 (`nginx -v`)
- [ ] 防火墙已开放端口：80、443、3000、8080
- [ ] 拥有服务器 root/sudo 权限

### 域名配置
- [ ] DNS A 记录已指向服务器 IP（`autotest.wiac.xyz`）
- [ ] DNS 解析已生效（`nslookup autotest.wiac.xyz`）

### CNB 配置
- [ ] CNB 项目存在（`https://cnb.cool/ImAcaiy/Automation_Platform`）
- [ ] CNB Docker Token 已获取（个人设置 → Access Tokens）
- [ ] CNB 流水线至少构建过一次，制品库中存在镜像：`docker.cnb.cool/imacaiy/automation_platform:latest`

### 数据库配置
- [ ] 数据库主机 `117.72.182.23` 可从服务器访问
- [ ] 数据库 `autotest` 已创建
- [ ] 数据库用户及密码正确

### Jenkins 配置
- [ ] Jenkins 可访问（`http://jenkins.wiac.xyz:8080`）
- [ ] Jenkins API Token 已获取

---

## 🔧 初始化部署步骤

### 方式一：使用脚本（推荐首次部署）

- [ ] 上传 `docs/deploy-setup.sh` 到服务器
- [ ] 执行 `sudo bash deploy-setup.sh`
- [ ] 填写域名：`autotest.wiac.xyz`
- [ ] 填写 CNB Docker Token
- [ ] 填写数据库主机：`117.72.182.23`
- [ ] 填写数据库密码
- [ ] 填写数据库名：`autotest`
- [ ] 填写 Jenkins URL：`http://jenkins.wiac.xyz:8080`
- [ ] 填写 Jenkins 用户名和 API Token
- [ ] 脚本执行完成，容器正常启动

### 方式二：手动部署

- [ ] 创建目录 `/opt/automation-platform/`
- [ ] 创建 `.env` 文件（参考 `DOCKER_DEPLOYMENT_GUIDE.md` 第二步）
- [ ] 创建 `docker-compose.yml`
- [ ] 登录 CNB 制品库：`echo "$CNB_DOCKER_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin`
- [ ] 拉取并启动容器：`docker-compose pull && docker-compose up -d`

### Nginx 配置（两种方式均需手动配置）

- [ ] 创建 `/etc/nginx/conf.d/autotest.conf`（反代到 `127.0.0.1:3000`）
- [ ] 测试配置：`nginx -t`
- [ ] 重载配置：`systemctl reload nginx`

---

## ✅ 部署后验证

- [ ] 容器状态为 `healthy`：`docker-compose ps`
- [ ] 健康检查通过：`curl http://localhost:3000/api/health` 返回 `{"status":"ok"}`
- [ ] Nginx 反代正常：浏览器访问 `http://autotest.wiac.xyz` 可打开页面
- [ ] 数据库连接正常（查看容器日志无数据库连接错误）
- [ ] 用户可以正常登录

---

## 🔄 Jenkins 自动部署配置

- [ ] Jenkins 中创建 Pipeline Job（名称：`automation-platform-deploy`）
- [ ] Pipeline 关联项目仓库，Script Path 设为 `Jenkinsfile.deploy`
- [ ] 触发一次手动构建，验证流程正常
- [ ] （可选）在 `.cnb.yml` 中添加 Jenkins Webhook，实现 push 后自动部署

---

## 🔒 SSL 证书（可选）

- [ ] HTTP 访问正常后，执行：`certbot --nginx -d autotest.wiac.xyz`
- [ ] 证书申请成功，HTTPS 访问正常
- [ ] 自动续期已启用：`systemctl enable certbot.timer`

---

## 📊 日常维护检查

### 每日
- [ ] 容器运行状态正常（`docker-compose ps`）
- [ ] 无异常错误日志（`docker-compose logs --tail=50`）

### 每周
- [ ] 磁盘空间充足（`df -h`）
- [ ] 清理未使用的 Docker 资源（`docker system prune -f`）

### 每月
- [ ] SSL 证书有效期检查（`certbot certificates`）
- [ ] 数据库备份（`mysqldump -u root -p autotest > backup-$(date +%Y%m%d).sql`）

---

## 🛠️ 常用命令速查

```bash
# 查看容器状态
docker-compose -f /opt/automation-platform/docker-compose.yml ps

# 查看实时日志
cd /opt/automation-platform && docker-compose logs -f

# 重启容器
cd /opt/automation-platform && docker-compose restart

# 手动更新镜像
cd /opt/automation-platform
source .env
echo "$CNB_DOCKER_TOKEN" | docker login docker.cnb.cool -u cnb --password-stdin
docker-compose pull && docker-compose up -d

# 重载 Nginx
nginx -t && systemctl reload nginx
```
