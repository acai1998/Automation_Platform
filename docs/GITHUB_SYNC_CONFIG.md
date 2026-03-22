# GitHub 同步配置说明

## 📋 概述

CNB 仓库现已配置为在每次构建完成后自动同步代码到 GitHub 仓库，确保两个仓库保持一致。

## 🔧 配置步骤

### 1. 生成 GitHub Personal Access Token

1. 访问 GitHub: https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 设置 Token 名称（例如: `CNB-Sync-Token`）
4. 选择以下权限：
   - ✅ **repo** - 完整的仓库访问权限
   - ✅ **repo:status** - 仓库状态权限
   - ✅ **repo_deployment** - 仓库部署权限
   - ✅ **public_repo** - 公开仓库权限（如果仓库是公开的）
5. 点击 "Generate token"
6. **重要**: 立即复制生成的 Token（只显示一次！）

### 2. 在 CNB 中配置 GITHUB_TOKEN

有两种方式配置环境变量：

#### 方式一：通过 CNB Web UI（推荐）

1. 访问你的 CNB 项目：https://cnb.cool/ImAcaiy/Automation_Platform
2. 点击 "设置" (Settings)
3. 找到 "CI/CD 变量" 或 "环境变量" 部分
4. 点击 "添加变量"
5. 配置如下：
   - **变量名**: `GITHUB_TOKEN`
   - **变量值**: 粘贴你刚才复制的 GitHub Token
   - **保护变量**: 勾选（可选，增加安全性）
   - **屏蔽变量**: 勾选（避免在日志中显示）
6. 点击 "保存"

#### 方式二：通过 API（高级用户）

```bash
# 使用 CNB API 添加环境变量
curl -X POST "https://api.cnb.cool/v1/projects/{project_id}/variables" \
  -H "Authorization: Bearer YOUR_CNB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "GITHUB_TOKEN",
    "value": "YOUR_GITHUB_TOKEN",
    "protected": true,
    "masked": true
  }'
```

### 3. 验证配置

配置完成后，可以通过以下方式验证：

#### 检查环境变量是否设置

在 CNB 构建日志中查看是否有 `GITHUB_TOKEN` 相关信息。

#### 手动触发构建测试

1. 在 CNB 项目页面，点击 "触发构建" 或推送一个测试提交
2. 等待构建完成
3. 查看 "同步代码到 GitHub" 流水线的执行结果
4. 检查 GitHub 仓库是否收到更新

## 🔄 同步流程

### 自动触发流程

```
开发者推送代码到 CNB
    ↓
CNB 检测到新的提交
    ↓
自动触发构建（构建 Docker 镜像）
    ↓
构建成功后自动触发同步
    ↓
推送代码到 GitHub master 分支
    ↓
完成同步
```

### 同步特点

- ✅ **自动执行**: 每次 CNB 构建成功后自动同步
- ✅ **强制推送**: 使用 `--force` 确保两个仓库完全一致
- ✅ **保留提交信息**: 所有提交信息和作者信息都会保留
- ✅ **实时同步**: 通常在几秒到几分钟内完成

## 📝 .cnb.yml 配置说明

### 流水线配置

```yaml
- name: "同步代码到 GitHub"
  env:
    GITHUB_REPO: "https://github.com/acai1998/Automation_Platform.git"
    GITHUB_TOKEN: "${GITHUB_TOKEN}"  # 从 CNB 环境变量读取
  stages:
    # 配置 Git
    # 推送到 GitHub
```

### 关键参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `GITHUB_REPO` | GitHub 仓库地址 | `https://github.com/acai1998/Automation_Platform.git` |
| `GITHUB_TOKEN` | GitHub 访问令牌 | 从 CNB 环境变量读取 |
| `CNB_COMMIT_SHA` | 当前提交的 SHA 值 | CNB 自动提供 |
| `CNB_BRANCH` | 当前分支名称 | CNB 自动提供 |

## 🛡️ 安全建议

### 1. Token 权限最小化

只授予必要的权限：
- 如果只需要推送代码，只需 `repo` 权限
- 不需要 `admin` 或 `delete_repo` 权限

### 2. 定期更新 Token

建议每 90 天更新一次 GitHub Token：
1. 在 GitHub 中删除旧 Token
2. 生成新 Token
3. 在 CNB 中更新 `GITHUB_TOKEN`

### 3. 启用 Token 保护

在 CNB 中：
- ✅ 勾选 "保护变量" - 只在受保护的分支中使用
- ✅ 勾选 "屏蔽变量" - 在日志中隐藏 Token 值

### 4. 监控同步状态

定期检查：
- GitHub 仓库的提交历史
- CNB 构建日志
- 两个仓库的提交 SHA 是否一致

## 🔍 故障排查

### 问题 1: 同步失败 - Token 错误

**错误信息**:
```
❌ 错误: GITHUB_TOKEN 环境变量未设置
```

**解决方案**:
1. 检查 CNB 项目设置中是否配置了 `GITHUB_TOKEN`
2. 确认 Token 值正确（没有多余空格或换行）
3. 检查 Token 是否已过期或被撤销

### 问题 2: 推送失败 - 权限不足

**错误信息**:
```
remote: Permission to acai1998/Automation_Platform.git denied to user
fatal: unable to access 'https://github.com/...'
```

**解决方案**:
1. 检查 Token 是否有足够的权限（至少需要 `repo`）
2. 确认 Token 所有者有仓库的推送权限
3. 检查 GitHub 仓库是否为私有，如果是，需要 Token 有访问权限

### 问题 3: 推送失败 - 分支冲突

**错误信息**:
```
! [rejected]        master -> master (fetch first)
error: failed to push some refs to 'https://github.com/...'
```

**解决方案**:
配置中已经使用了 `--force` 参数，如果仍然失败：
1. 检查 GitHub 仓库是否有保护规则（branch protection）
2. 确认 CNB 的推送权限
3. 手动在 CNB 构建脚本中添加 `git fetch --all` 和 `git reset --hard`

### 问题 4: 同步成功但 GitHub 未更新

**可能原因**:
1. CNB 缓存延迟
2. GitHub API 响应延迟
3. 推送到错误的分支

**解决方案**:
1. 等待 1-2 分钟后检查
2. 刷新 GitHub 仓库页面
3. 检查构建日志中的分支名称是否正确

## 📊 监控和日志

### 查看同步日志

在 CNB 构建页面中：
1. 找到 "同步代码到 GitHub" 流水线
2. 展开查看详细日志
3. 检查是否有错误信息

### 关键日志片段

**成功日志**:
```
========================================
🔄 开始同步到 GitHub
========================================
✅ Git 配置完成
📤 推送代码到 GitHub...
提交: abc123def456...
分支: master
========================================
✅ 同步成功！
🔗 GitHub 仓库: https://github.com/acai1998/Automation_Platform
========================================
```

**失败日志**:
```
❌ 错误: GITHUB_TOKEN 环境变量未设置
请在 CNB 项目设置中配置 GITHUB_TOKEN
```

## 🔄 高级配置

### 只同步特定分支

如果只想同步特定分支（如 master/main），修改 `.cnb.yml`:

```yaml
stages:
  - name: "检查分支"
    script: |
      if [ "${CNB_BRANCH}" != "master" ] && [ "${CNB_BRANCH}" != "main" ]; then
        echo "⏭️  跳过同步：只同步 master/main 分支"
        exit 0
      fi
```

### 同步多个仓库

如果需要同步到多个仓库，在 `.cnb.yml` 中添加更多 stages:

```yaml
stages:
  - name: "同步到 GitHub"
    script: |
      # ... 同步到第一个仓库 ...
  
  - name: "同步到 GitLab"
    script: |
      # ... 同步到 GitLab ...
```

### 同步标签

如果需要同步标签（tags），修改推送命令：

```yaml
script: |
  # 推送分支
  git push github ${CNB_BRANCH} --force
  
  # 推送所有标签
  git push github --tags --force
```

## 📚 参考资源

- [GitHub Personal Access Tokens 文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [CNB 环境变量配置](https://cnb.cool/docs/environment-variables)
- [Git 强制推送最佳实践](https://git-scm.com/docs/git-push)

## ✅ 配置检查清单

完成配置后，请确认以下项目：

- [ ] 已生成 GitHub Personal Access Token
- [ ] Token 有足够的权限（至少 `repo`）
- [ ] 在 CNB 项目设置中配置了 `GITHUB_TOKEN`
- [ ] `GITHUB_TOKEN` 已标记为保护变量和屏蔽变量
- [ ] 推送测试提交到 CNB
- [ ] CNB 构建成功
- [ ] GitHub 仓库成功收到更新
- [ ] 两个仓库的提交 SHA 一致
- [ ] 定期检查同步状态

---

**注意**: Token 是敏感信息，请妥善保管，不要泄露给他人！
