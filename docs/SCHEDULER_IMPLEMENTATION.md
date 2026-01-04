# 定时同步任务实现说明

## 实现概述

已实现完整的仓库定时同步功能，支持从 Git 仓库自动拉取测试脚本，解析并创建测试用例到数据库。

## 核心组件

### 1. SchedulerService（定时任务调度器）

**文件位置**：`server/services/SchedulerService.ts`

**功能**：
- 管理所有仓库的定时同步任务
- 根据仓库配置的 `sync_interval` 自动调度
- 支持动态添加/移除定时任务
- 优雅关闭处理

**关键方法**：
- `start()`: 启动调度器
- `stop()`: 停止所有定时任务
- `loadAndScheduleRepositories()`: 加载并调度所有仓库
- `triggerSync(repoId)`: 手动触发同步

### 2. RepositorySyncService（同步服务）

**文件位置**：`server/services/RepositorySyncService.ts`

**功能**：
- 执行仓库同步流程
- 解析脚本文件
- 创建/更新用例到数据库
- 记录同步日志

### 3. ScriptParserService（脚本解析服务）

**文件位置**：`server/services/ScriptParserService.ts`

**功能**：
- 解析 Python/JavaScript/Java 脚本
- 提取用例名称、说明、路径
- 生成 pytest 格式的完整路径

## 工作流程

```
服务器启动
    ↓
SchedulerService.start()
    ↓
加载所有活跃仓库（sync_interval > 0）
    ↓
为每个仓库创建定时任务
    ↓
定时执行同步
    ↓
RepositorySyncService.performSync()
    ↓
1. 拉取 Git 仓库
2. 扫描脚本文件
3. 解析脚本
4. 创建/更新用例
5. 记录日志
```

## 配置说明

### 同步间隔（sync_interval）

- **单位**：分钟
- **0**：不自动同步，只能手动触发
- **> 0**：每 N 分钟自动同步一次

**建议值**：
- 30：每 30 分钟
- 60：每小时
- 1440：每天

### 仓库配置示例

```json
{
  "name": "SeleniumBase UI 测试",
  "repo_url": "https://gitee.com/Ac1998/SeleniumBase-CI.git",
  "branch": "master",
  "script_type": "python",
  "script_path_pattern": "test_case/**/*.py",
  "sync_interval": 60,
  "auto_create_cases": true
}
```

## 脚本解析结果

### Python unittest 示例

**脚本**：
```python
class TestLogin(unittest.TestCase):
    def test_user_login(self):
        """验证用户登录功能"""
        pass
```

**解析结果**：
- 用例名称：`TestLogin::test_user_login`
- 脚本路径：`test_case/test_login.py::TestLogin::test_user_login`
- 用例说明：`验证用户登录功能`
- 用例类型：根据仓库名称推断（ui/api/performance）

## 数据库存储

### test_cases 表

| 字段 | 说明 | 示例 |
|------|------|------|
| name | 用例名称 | `TestLogin::test_user_login` |
| script_path | pytest 路径 | `test_case/test_login.py::TestLogin::test_user_login` |
| description | 用例说明 | `验证用户登录功能` |
| type | 用例类型 | `ui` / `api` / `performance` |

## 定时任务管理

### 自动调度

- 服务器启动时自动加载所有需要同步的仓库
- 每 5 分钟检查一次是否有新仓库需要调度
- 仓库更新后自动重新调度

### 立即同步

- 如果距离上次同步超过间隔时间，立即执行一次
- 如果从未同步过，立即执行一次

## 日志记录

每次同步都会记录详细日志到 `sync_logs` 表：

- 同步时间
- 同步状态
- 文件统计（新增/修改/删除）
- 用例统计（创建/更新）
- 错误信息

## 使用步骤

### 1. 创建仓库配置

1. 访问仓库管理页面
2. 点击"新建仓库"
3. 填写仓库信息：
   - 仓库地址：`https://gitee.com/Ac1998/SeleniumBase-CI.git`
   - 分支：`master`
   - 脚本类型：`Python`
   - 脚本路径模式：`test_case/**/*.py`
   - 同步间隔：`60`（每小时）
   - 自动创建用例：✓

### 2. 手动同步（可选）

点击仓库列表中的"同步"按钮，立即执行一次同步。

### 3. 查看同步结果

- 查看同步日志
- 在用例管理页面查看创建的用例
- 确认用例的脚本路径格式正确

## 注意事项

1. **脚本路径模式**：确保 glob 模式正确匹配您的文件结构
2. **用例类型推断**：在仓库名称中包含类型关键词（ui/api/performance）
3. **同步间隔**：根据仓库更新频率合理设置
4. **服务器重启**：定时任务会在服务器重启后自动恢复

## 故障排查

### 定时任务不执行

1. 检查 `sync_interval > 0`
2. 检查仓库状态为 `active`
3. 查看服务器日志
4. 确认服务器时间正确

### 同步失败

1. 查看同步日志中的错误信息
2. 检查 Git 仓库地址和权限
3. 确认脚本路径模式正确
4. 检查脚本文件格式是否符合解析规则

### 用例未创建

1. 确认"自动创建用例"已勾选
2. 检查脚本文件是否包含 `test_` 开头的函数/方法
3. 查看同步日志中的用例统计
4. 确认脚本路径模式匹配文件

## API 接口

### 手动同步
```bash
POST /api/repositories/:id/sync
```

### 获取同步日志
```bash
GET /api/repositories/:id/sync-logs?limit=20&offset=0
```

### 获取已调度的仓库
```bash
GET /api/repositories?status=active
```
