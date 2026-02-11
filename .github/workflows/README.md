# GitHub Actions Workflows

## 工作流说明

### 1. sync-to-cnb.yml - 代码同步工作流

自动将代码同步到 CNB 和 GitHub 镜像仓库。

#### 触发条件
- `master` 分支推送时自动触发
- 手动触发（workflow_dispatch）

#### 同步流程
1. **检查 CNB 连接性**
   - Ping 测试
   - DNS 解析测试
   - HTTPS 连接测试

2. **同步到 CNB**（可选，失败不影响后续流程）
   - 配置 Git 超时参数
   - 最多重试 3 次
   - 每次重试间隔 10 秒

3. **同步到 GitHub 镜像**
   - 推送到 `github.com/acai1998/Automation_Platform`

#### 故障处理
- CNB 同步失败不会导致整个工作流失败
- 会输出详细的状态报告
- GitHub 同步会继续执行

#### 常见问题

##### CNB 连接失败
**原因**：
- GitHub Actions runner 到 `cnb.cool` 网络不通
- CNB 服务器可能屏蔽了 GitHub Actions IP 段
- CNB 服务器维护或宕机

**解决方案**：
1. 检查 CNB 服务器状态
2. 联系 CNB 管理员配置防火墙白名单
3. 考虑使用自托管 runner（如果需要）

##### 认证失败
**原因**：
- `CNB_TOKEN` Secret 未配置或已过期

**解决方案**：
1. 在 GitHub 仓库设置中配置 `CNB_TOKEN`
2. 确保 Token 有推送权限

### 2. ci.yml - 持续集成工作流

运行测试和类型检查。

#### 触发条件
- Pull Request 到 `main` 或 `master` 分支
- 推送到 `main` 或 `master` 分支

#### 检查项
- 前端类型检查
- 后端类型检查
- 前端测试
- 后端测试

### 3. docker-image.yml - Docker 镜像构建

构建和推送 Docker 镜像。

#### 触发条件
- 推送到 `main` 分支
- 手动触发

## Secrets 配置

在仓库设置中配置以下 Secrets：

| Secret 名称 | 说明 | 必需 |
|------------|------|------|
| `CNB_TOKEN` | CNB Git 访问令牌 | 是（用于 CNB 同步） |
| `GITHUB_TOKEN` | GitHub 自动提供 | 否（自动提供） |

## 手动触发工作流

```bash
# 使用 GitHub CLI 手动触发同步
gh workflow run sync-to-cnb.yml

# 查看工作流运行状态
gh run list --workflow=sync-to-cnb.yml
```

## 监控和调试

### 查看工作流日志
1. 进入 GitHub 仓库
2. 点击 "Actions" 标签
3. 选择对应的工作流运行
4. 查看详细日志

### 常见错误信息

#### `Failed to connect to cnb.cool port 443`
网络连接问题，CNB 同步会自动跳过，不影响 GitHub 同步。

#### `Authentication failed`
Token 配置问题，检查 Secrets 配置。

#### `rebase failed`
代码冲突，需要手动解决冲突后重新推送。

## 最佳实践

1. **定期检查工作流状态**
   - 确保同步正常运行
   - 及时发现和解决问题

2. **Token 安全管理**
   - 定期更新访问令牌
   - 使用最小权限原则

3. **失败通知**
   - 配置邮件或 Slack 通知（可选）
   - 及时响应失败警告

## 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Git 配置参考](https://git-scm.com/docs/git-config)
- [项目部署指南](../../deployment/README.md)
