# 部署检查清单

## 📋 部署前检查

### 服务器环境
- [ ] 服务器已安装 Docker (`docker --version`)
- [ ] 服务器已安装 Docker Compose (`docker-compose --version`)
- [ ] 服务器已安装 Nginx (`nginx -v`)
- [ ] 防火墙已配置 (端口 80, 443, 3000, 8080 已开放)
- [ ] 拥有服务器 sudo 权限
- [ ] 服务器磁盘空间充足 (> 10GB)

### 域名配置
- [ ] 域名已完成 DNS 解析（A 记录指向服务器 IP）
- [ ] 域名解析已生效（`nslookup your-domain.com`）

### CNB 配置
- [ ] 已在 CNB 创建项目（ImAcaiy/Automation_Platform）
- [ ] 已获取 CNB Docker Token
- [ ] 已获取 CNB API Token
- [ ] `.cnb.yml` 配置正确
- [ ] CNB 构建流水线配置完成
- [ ] CNB 镜像可以正常构建和推送

### 数据库配置
- [ ] 数据库已创建（`automation_platform`）
- [ ] 数据库用户已创建
- [ ] 数据库密码已设置
- [ ] 数据库连接配置正确（主机、端口、用户名、密码、数据库名）
- [ ] 数据表已初始化（如果需要）

### Jenkins 配置
- [ ] Jenkins 已安装并可访问
- [ ] Jenkins 已安装必要插件（Docker Pipeline, Docker, Git）
- [ ] 已创建 Jenkins 凭据（CNB_DOCKER_TOKEN, CNB_TOKEN）
- [ ] 已创建部署 Pipeline Job
- [ ] Jenkinsfile.deploy 已配置

## 🔧 部署步骤检查

### 初始安装
- [ ] 运行 `sudo bash deploy-setup.sh`
- [ ] 正确输入域名信息
- [ ] 正确输入 CNB Token
- [ ] 正确输入数据库配置
- [ ] 正确输入 Jenkins 配置
- [ ] 项目目录创建成功 (`/opt/automation-platform`)
- [ ] docker-compose.yml 创建成功
- [ ] .env 文件创建成功
- [ ] Nginx 配置文件创建成功

### SSL 证书安装
- [ ] 运行 `sudo certbot --nginx -d your-domain.com`
- [ ] SSL 证书安装成功
- [ ] SSL 证书自动续期已配置

### 应用部署
- [ ] CNB Docker 登录成功 (`docker login cr.cnb.cool`)
- [ ] 镜像拉取成功 (`docker pull cr.cnb.cool/imacaiy/automation-platform:latest`)
- [ ] Docker 容器启动成功 (`docker-compose up -d`)
- [ ] 容器状态正常 (`docker ps`)

## ✅ 部署后验证

### 基础功能
- [ ] 容器正常运行（`docker ps | grep automation-platform`）
- [ ] 应用本地可访问（`curl http://localhost:3000/api/health`）
- [ ] Nginx 配置生效（`sudo nginx -t`）
- [ ] SSL 证书有效（访问 https://your-domain.com）
- [ ] 域名可以正常访问
- [ ] HTTPS 连接正常

### 应用功能
- [ ] 数据库连接正常
- [ ] 用户可以登录
- [ ] 测试用例可以执行
- [ ] Jenkins 可以正常触发测试
- [ ] 测试结果可以正常回调

### 日志检查
- [ ] 应用日志正常记录（`docker logs automation-platform`）
- [ ] Nginx 访问日志正常（`/opt/automation-platform/logs/nginx-access.log`）
- [ ] Nginx 错误日志无异常（`/opt/automation-platform/logs/nginx-error.log`）

### 自动化测试
- [ ] Jenkins 可以成功部署应用
- [ ] CNB 构建后可以自动触发 Jenkins 部署（可选）
- [ ] 部署失败时可以正确回滚

## 🔍 故障排查检查

### 容器问题
- [ ] 容器无法启动 → 检查日志（`docker logs automation-platform`）
- [ ] 容器频繁重启 → 检查健康检查配置
- [ ] 容器资源占用过高 → 限制容器资源

### 网络问题
- [ ] 域名无法访问 → 检查 DNS 解析
- [ ] 502 Bad Gateway → 检查应用容器状态
- [ ] SSL 证书错误 → 检查证书有效期

### 镜像问题
- [ ] 镜像拉取失败 → 检查 CNB Token 和网络
- [ ] 镜像版本错误 → 检查镜像标签

### 数据库问题
- [ ] 数据库连接失败 → 检查数据库配置
- [ ] 数据表不存在 → 初始化数据库

## 📊 监控和维护

### 日常监控
- [ ] 容器运行状态监控
- [ ] 应用日志监控
- [ ] Nginx 日志监控
- [ ] 磁盘空间监控
- [ ] CPU/内存使用监控

### 定期维护
- [ ] 定期更新镜像（`docker pull`）
- [ ] 定期清理未使用的资源（`docker system prune`）
- [ ] 定期备份数据
- [ ] 定期检查 SSL 证书有效期
- [ ] 定期更新系统和软件包

### 备份检查
- [ ] 数据库备份配置
- [ ] 应用数据备份配置
- [ ] 配置文件备份
- [ ] 备份恢复测试

## 🎯 性能优化

### 容器优化
- [ ] 设置容器资源限制
- [ ] 优化 Docker 镜像大小
- [ ] 使用多阶段构建

### Nginx 优化
- [ ] 启用 Gzip 压缩
- [ ] 配置静态资源缓存
- [ ] 优化连接超时设置

### 应用优化
- [ ] 数据库连接池配置
- [ ] 启用应用缓存
- [ ] 优化查询性能

## 🔒 安全检查

### 基础安全
- [ ] 防火墙配置正确
- [ ] SSH 登录已加固
- [ ] 系统已更新最新补丁
- [ ] 不必要的端口已关闭

### 应用安全
- [ ] 环境变量已加密存储
- [ ] 数据库密码已加密
- [ ] HTTPS 已强制启用
- [ ] API 接口已验证

### 数据安全
- [ ] 数据已定期备份
- [ ] 敏感数据已加密
- [ ] 访问权限已正确配置

## 📝 文档检查

- [ ] 部署文档完整
- [ ] 配置说明清晰
- [ ] 故障排查文档
- [ ] API 文档
- [ ] 操作手册

## 🔄 更新流程

### 更新前
- [ ] 代码已推送到 CNB
- [ ] CNB 构建成功
- [ ] 镜像已推送到制品库
- [ ] 已阅读更新日志

### 更新中
- [ ] 备份当前版本
- [ ] 拉取新镜像
- [ ] 停止旧容器
- [ ] 启动新容器
- [ ] 健康检查通过

### 更新后
- [ ] 功能测试通过
- [ ] 性能测试通过
- [ ] 日志无异常
- [ ] 回滚方案已准备

## 📞 应急联系

- [ ] 技术负责人：________________
- [ ] 运维负责人：________________
- [ ] 数据库管理员：________________
- [ ] 紧急联系电话：________________

## 📅 检查频率建议

- **每日**: 容器运行状态、错误日志
- **每周**: 磁盘空间、系统更新
- **每月**: 备份检查、安全审查
- **每季度**: 性能评估、架构优化

---

**注意**: 本检查清单应在部署前、部署中和部署后逐项确认，确保部署过程顺利完成。
