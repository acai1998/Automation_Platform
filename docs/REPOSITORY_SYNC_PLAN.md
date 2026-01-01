# 远程仓库测试脚本同步功能规划文档

## 📋 功能概述

实现一个完整的远程仓库（Git）测试脚本同步管理系统，支持：
- ✅ 配置和管理多个远程 Git 仓库
- ✅ 自动/手动同步远程仓库中的测试脚本
- ✅ 智能解析同步的脚本文件，自动生成测试用例
- ✅ 版本控制和变更追踪
- ✅ 冲突检测和处理
- ✅ 同步日志记录和报告

---

## 🏗️ 架构设计

### 1. 数据库扩展

#### 新增表：`repository_configs`（仓库配置表）
```sql
CREATE TABLE repository_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    repo_url VARCHAR(500) NOT NULL,
    branch VARCHAR(100) DEFAULT 'main',
    auth_type VARCHAR(20) DEFAULT 'none' CHECK (auth_type IN ('none', 'ssh', 'token')),
    credentials_encrypted TEXT,
    script_path_pattern VARCHAR(255), -- 例如：tests/**/*.js
    script_type VARCHAR(50) DEFAULT 'javascript' CHECK (script_type IN ('javascript', 'python', 'java', 'other')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    last_sync_at DATETIME,
    last_sync_status VARCHAR(20),
    sync_interval INTEGER, -- seconds, 0 = manual only
    auto_create_cases BOOLEAN DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 新增表：`sync_logs`（同步日志表）
```sql
CREATE TABLE sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_config_id INTEGER NOT NULL REFERENCES repository_configs(id) ON DELETE CASCADE,
    sync_type VARCHAR(20) CHECK (sync_type IN ('manual', 'scheduled', 'webhook')),
    status VARCHAR(20) CHECK (status IN ('pending', 'running', 'success', 'failed')),
    total_files INTEGER DEFAULT 0,
    added_files INTEGER DEFAULT 0,
    modified_files INTEGER DEFAULT 0,
    deleted_files INTEGER DEFAULT 0,
    created_cases INTEGER DEFAULT 0,
    updated_cases INTEGER DEFAULT 0,
    conflicts_detected INTEGER DEFAULT 0,
    error_message TEXT,
    start_time DATETIME,
    end_time DATETIME,
    duration INTEGER, -- seconds
    triggered_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 新增表：`repository_script_mappings`（脚本与用例映射表）
```sql
CREATE TABLE repository_script_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_config_id INTEGER NOT NULL REFERENCES repository_configs(id) ON DELETE CASCADE,
    case_id INTEGER REFERENCES test_cases(id) ON DELETE CASCADE,
    script_file_path VARCHAR(500) NOT NULL,
    script_hash VARCHAR(64), -- SHA256 hash for change detection
    last_synced_at DATETIME,
    status VARCHAR(20) DEFAULT 'synced' CHECK (status IN ('synced', 'modified', 'deleted', 'conflict')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔧 后端实现

### 2. 服务层

#### `server/services/RepositoryService.ts`
负责 Git 仓库操作（克隆、拉取、分支管理等）

#### `server/services/RepositorySyncService.ts`
负责同步逻辑（脚本解析、用例生成、冲突处理）

#### `server/services/ScriptParserService.ts`
负责解析不同类型的测试脚本文件

### 3. API 路由 (`server/routes/repositories.ts`)

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/api/repositories` | 获取仓库配置列表 |
| GET | `/api/repositories/:id` | 获取仓库详情 |
| POST | `/api/repositories` | 创建新仓库配置 |
| PUT | `/api/repositories/:id` | 更新仓库配置 |
| DELETE | `/api/repositories/:id` | 删除仓库配置 |
| POST | `/api/repositories/:id/sync` | 手动触发同步 |
| GET | `/api/repositories/:id/sync-logs` | 获取同步日志 |
| GET | `/api/repositories/:id/sync-logs/:logId` | 获取同步详情 |
| POST | `/api/repositories/:id/test-connection` | 测试连接 |
| GET | `/api/repositories/:id/branches` | 获取分支列表 |

---

## 💻 前端实现

### 4. 页面结构

- `src/pages/RepositoryManagement.tsx` - 仓库管理主页面
- `src/pages/RepositoryDetail.tsx` - 仓库详情页
- `src/pages/SyncLogs.tsx` - 同步日志查看页

### 5. 组件

- `src/components/RepositoryForm.tsx` - 仓库配置表单
- `src/components/RepositoryList.tsx` - 仓库列表
- `src/components/SyncProgress.tsx` - 同步进度组件
- `src/components/SyncLogDetail.tsx` - 同步日志详情

### 6. API 客户端 (`src/api/repositories.ts`)

封装前端 API 调用

---

## 📊 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 配置远程仓库                                              │
│    - 输入 Git 仓库 URL                                      │
│    - 配置认证信息（如需要）                                  │
│    - 设置脚本路径模式                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 触发同步                                                  │
│    - 手动同步 / 定时同步 / Webhook 触发                    │
│    - 创建同步日志记录（状态：pending）                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 克隆/拉取仓库                                             │
│    - 使用 simple-git 库操作 Git                            │
│    - 获取指定分支的最新代码                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 扫描脚本文件                                              │
│    - 按照路径模式查找脚本文件                                │
│    - 计算文件 Hash 用于变更检测                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 解析脚本                                                  │
│    - 根据脚本类型（JS/Python/Java）解析                    │
│    - 提取测试用例元数据（名称、描述、标签等）                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. 冲突检测与处理                                            │
│    - 检测本地与远程的差异                                    │
│    - 提示用户处理冲突                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. 创建/更新用例                                             │
│    - 根据解析结果创建新用例                                  │
│    - 更新已存在的用例                                        │
│    - 记录脚本与用例的映射关系                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. 完成同步                                                  │
│    - 更新同步日志（状态：success/failed）                   │
│    - 返回同步结果摘要                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 安全考虑

1. **凭证管理**：使用加密存储 SSH 密钥和 Token
2. **权限控制**：仅允许特定角色（admin/developer）配置仓库
3. **输入验证**：验证 Git URL 和脚本路径
4. **沙箱执行**：脚本解析在受控环境中进行

---

## 🚀 实现步骤

### Phase 1: 基础设施（今天完成）
- [x] 设计数据库表结构
- [ ] 创建 RepositoryService
- [ ] 创建 RepositorySyncService
- [ ] 创建 API 路由

### Phase 2: 前端界面（明天）
- [ ] 创建前端页面和组件
- [ ] 集成 API 客户端
- [ ] 实现 UI 交互

### Phase 3: 测试与优化（后天）
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化

---

## 📦 依赖库

需要添加以下 npm 包：
- `simple-git` - Git 操作
- `crypto` - 文件 Hash 计算（Node.js 内置）
- `glob` - 文件模式匹配