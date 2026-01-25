# Jenkins 配置操作清单

## 🎯 当前状态
- ✅ 已创建 AutoTest Jenkins 任务
- ✅ 已配置 GitHub 仓库地址
- ✅ 已更新平台 .env 配置文件
- ⏳ 待完成：Jenkins 凭据配置和任务参数设置

## 📋 立即需要完成的操作

### 1. 配置 Jenkins 凭据 (5分钟)

**访问**: `http://jenkins.wiac.xyz:8080/`

1. **登录 Jenkins**
2. **进入凭据管理**:
   - Manage Jenkins → Manage Credentials → (global) → Add Credentials

3. **添加 Git 凭据**:
   ```
   Kind: Username with password
   Username: acai1998
   Password: [您的 GitHub Personal Access Token]
   ID: git-credentials
   Description: GitHub 仓库访问凭据
   ```

**获取 GitHub Token**:
- GitHub → Settings → Developer settings → Personal access tokens → Generate new token
- 勾选 `repo` 权限

### 2. 完善 AutoTest 任务配置 (3分钟)

1. **进入任务配置**:
   - Jenkins 首页 → 点击 `AutoTest` → Configure

2. **设置凭据**:
   - 在 Source Code Management 部分
   - Credentials 下拉框选择: `git-credentials`

3. **添加构建参数**:
   - 勾选 "This project is parameterized"
   - 添加以下 6 个 String Parameter:

   | 参数名 | 默认值 | 描述 |
   |-------|-------|------|
   | `RUN_ID` | (空) | 执行批次ID |
   | `CASE_IDS` | `[]` | 用例ID列表(JSON) |
   | `SCRIPT_PATHS` | (空) | 脚本路径(逗号分隔) |
   | `CALLBACK_URL` | (空) | 回调URL |
   | `MARKER` | (空) | Pytest marker标记 |
   | `REPO_URL` | (空) | 测试用例仓库URL |

4. **保存配置**

### 3. 测试配置 (5分钟)

运行测试脚本验证配置:
```bash
cd /path/to/your/project
./scripts/test-jenkins-connection.sh
```

或者手动测试:

1. **启动平台应用**:
   ```bash
   npm run start
   ```

2. **测试 Jenkins 连接**:
   ```bash
   curl http://localhost:3000/api/jenkins/health
   ```

3. **手动触发构建**:
   - 访问: `http://jenkins.wiac.xyz:8080/job/AutoTest/`
   - 点击 "Build with Parameters"
   - 填入测试参数后点击 "Build"

## 🔧 配置详情

### 当前环境变量配置
```env
JENKINS_URL=http://jenkins.wiac.xyz:8080
JENKINS_USER=root
JENKINS_TOKEN=116fb13c3cc6cd3e33e688bacc26e18b60
JENKINS_JOB_NAME=AutoTest
JENKINS_API_KEY=3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f
API_CALLBACK_URL=http://localhost:3000/api/jenkins/callback
```

### 回调认证方式
Jenkins 使用 API Key 认证方式回调平台:
```bash
X-Api-Key: 3512fc38e1882a9ad2ab88c436277c129517e24a76daad1849ef419f90fd8a4f
```

## 🚨 常见问题排查

### 1. Git 凭据问题
**现象**: 构建时提示 "Authentication failed"
**解决**: 检查 GitHub Token 是否有效，权限是否包含 `repo`

### 2. 回调失败
**现象**: Jenkins 构建成功但平台没收到回调
**解决**: 检查网络连通性，确保 Jenkins 能访问平台的 3000 端口

### 3. 参数缺失
**现象**: 构建时提示参数未定义
**解决**: 确认已添加所有 6 个构建参数

## ✅ 验证清单

完成配置后，确认以下项目:

- [ ] Jenkins 可以正常访问 GitHub 仓库
- [ ] AutoTest 任务有 6 个构建参数
- [ ] 平台健康检查接口返回正常: `curl http://localhost:3000/api/jenkins/health`
- [ ] 手动触发构建能正常执行
- [ ] Jenkins 能成功回调平台接口

## 🎉 下一步

配置完成后，您就可以:
1. 在平台中创建测试执行计划
2. 平台自动调用 Jenkins API 触发测试
3. Jenkins 执行测试后回调结果给平台
4. 在平台中查看测试执行历史和报告

---

如有问题，请检查 Jenkins 构建日志和平台应用日志。