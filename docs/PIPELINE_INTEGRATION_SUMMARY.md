# Pipeline 集成总结

## 问题分析

您的 Pipeline 当前运行整个 `test_case` 目录，但平台需要支持单个用例执行。

## 解决方案

### 1. 修改 Pipeline 支持参数化执行

已创建 `docs/JENKINS_PIPELINE_GUIDE.md`，包含完整的 Pipeline 配置。

**关键修改**：
- 添加参数：`SCRIPT_PATH`, `CASE_ID`, `CASE_TYPE`, `CALLBACK_URL`
- 条件执行：如果提供 `SCRIPT_PATH`，运行单个用例；否则运行整个目录
- 回调通知：执行完成后调用平台回调接口

### 2. script_path 格式优化

**修改前**：
- 只保存文件路径：`test_case/test_login.py`

**修改后**：
- 保存 pytest 完整路径：`test_case/test_login.py::TestLogin::test_user_login`
- 支持三种格式：
  1. 文件路径：`test_case/test_file.py`
  2. 类路径：`test_case/test_file.py::TestClass`
  3. 方法路径：`test_case/test_file.py::TestClass::test_method`（推荐）

### 3. 代码修改点

#### 脚本解析服务 (`ScriptParserService.ts`)
- ✅ 生成 pytest 格式的完整路径
- ✅ 保存到 `configJson.fullPath`
- ✅ 支持 unittest 和 pytest 两种框架

#### 同步服务 (`RepositorySyncService.ts`)
- ✅ 优先使用 `fullPath`，如果没有则使用文件路径
- ✅ 根据仓库名称自动推断用例类型（api/ui/performance）

#### Jenkins 服务 (`JenkinsService.ts`)
- ✅ 已实现参数传递：`SCRIPT_PATH`, `CASE_ID`, `CASE_TYPE`, `CALLBACK_URL`
- ✅ 使用 `buildWithParameters` API

## 数据流程

```
1. 同步仓库
   ↓
2. 解析脚本 → 提取用例信息
   - 用例名称：TestLogin::test_user_login
   - 脚本路径：test_case/test_login.py::TestLogin::test_user_login
   - 用例说明：从 docstring 提取
   ↓
3. 保存到数据库
   - script_path = "test_case/test_login.py::TestLogin::test_user_login"
   ↓
4. 用户点击"运行"
   ↓
5. 平台调用 Jenkins API
   - 传递 SCRIPT_PATH 参数
   ↓
6. Jenkins 执行单个用例
   - pytest test_case/test_login.py::TestLogin::test_user_login
   ↓
7. 执行完成后回调平台
   - 更新用例状态为 idle
```

## 配置步骤

### 1. 在 Jenkins 中配置 Job

1. 打开 Jenkins Job 配置
2. 勾选 **"This project is parameterized"**
3. 添加以下 String 参数：
   - `SCRIPT_PATH` (默认值: 空)
   - `CASE_ID` (默认值: 空)
   - `CASE_TYPE` (默认值: ui)
   - `CALLBACK_URL` (默认值: 空)

### 2. 更新 Pipeline 脚本

将 `docs/JENKINS_PIPELINE_GUIDE.md` 中的 Pipeline 代码复制到 Jenkins Job 配置中。

### 3. 测试验证

1. **同步仓库**：在平台仓库管理页面同步用例
2. **查看用例列表**：确认用例的 `script_path` 格式正确
3. **运行单个用例**：点击"运行"按钮，查看 Jenkins 是否接收参数并执行

## 注意事项

### script_path 格式要求

- ✅ **正确格式**：`test_case/test_login.py::TestLogin::test_user_login`
- ❌ **错误格式**：`test_case/test_login.py`（只包含文件路径）

### Pipeline 参数

- 必须将 Job 配置为参数化
- 参数名称必须与 Pipeline 中的 `params.SCRIPT_PATH` 等一致
- 回调 URL 必须可访问（Jenkins 能访问平台地址）

### 错误处理

- Pipeline 中的回调应该包含错误处理
- 如果执行失败，也应该回调平台更新状态

## 示例

### Python 测试脚本

```python
class TestLogin(unittest.TestCase):
    def test_user_login(self):
        """验证用户登录功能"""
        # 测试代码
        pass
```

### 解析后的用例

- **用例名称**：`TestLogin::test_user_login`
- **脚本路径**：`test_case/test_login.py::TestLogin::test_user_login`
- **用例说明**：`验证用户登录功能`（从 docstring 提取）

### Jenkins 执行命令

```bash
python -m pytest test_case/test_login.py::TestLogin::test_user_login \
  --browser=chrome \
  --dashboard --rs \
  --headless \
  --alluredir=allure-results \
  --junitxml=reports/junit.xml \
  --html=reports/report.html
```

## 后续优化建议

1. **支持批量执行**：可以传递多个 `SCRIPT_PATH`，用逗号分隔
2. **执行历史**：记录每次执行的详细信息
3. **实时状态**：通过 WebSocket 实时推送执行状态
4. **报告集成**：自动解析 Allure 报告并展示
