# 自动化测试平台 - 执行引擎架构设计

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 Dashboard                            │
│  (创建用例、配置任务、查看报告、触发执行)                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST API
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      后端服务 (Express)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  任务调度器  │  │  执行管理器  │  │      报告生成器         │  │
│  │ (Scheduler) │  │  (Executor)  │  │  (Report Generator)    │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘  │
└─────────┼────────────────┼──────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      执行引擎层 (Runners)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │Newman Runner │  │ HTTP Runner  │  │Pytest Runner │  ...     │
│  │(Postman集合) │  │(简单API测试) │  │(Python脚本)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 执行引擎类型

### 2.1 Newman Runner (Postman Collection)
- **适用场景**: 已有 Postman 集合，快速导入执行
- **优点**: 无需编码，可视化程度高
- **实现**: 使用 `newman` 库执行 Collection JSON

### 2.2 HTTP Runner (简单 API 测试)
- **适用场景**: 简单的 HTTP 接口测试，平台内直接配置
- **优点**: 无需外部依赖，配置即用
- **实现**: 使用 `axios/fetch` 发送请求，支持断言

### 2.3 Pytest Runner (Python 脚本)
- **适用场景**: 复杂测试逻辑，需要编程
- **优点**: 灵活性最高，生态丰富
- **实现**: 子进程调用 `pytest`，解析 JSON 报告

### 2.4 Playwright Runner (UI 测试)
- **适用场景**: Web UI 自动化测试
- **优点**: 跨浏览器支持，现代化 API
- **实现**: 子进程调用或 Node.js 直接集成

## 3. 用例配置结构

```typescript
interface TestCase {
  id: number;
  name: string;
  type: 'api' | 'postman' | 'pytest' | 'playwright';

  // API 类型配置
  apiConfig?: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    headers?: Record<string, string>;
    body?: any;
    assertions: Assertion[];
  };

  // Postman 类型配置
  postmanConfig?: {
    collectionJson: object;
    environmentJson?: object;
  };

  // Pytest 类型配置
  pytestConfig?: {
    scriptPath: string;
    args?: string[];
    pythonPath?: string;
  };

  // Playwright 类型配置
  playwrightConfig?: {
    scriptPath: string;
    browser?: 'chromium' | 'firefox' | 'webkit';
    headless?: boolean;
  };
}

interface Assertion {
  type: 'status' | 'jsonPath' | 'contains' | 'responseTime';
  target?: string;  // jsonPath 时使用
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex';
  expected: any;
}
```

## 4. 执行流程

```
1. 用户触发执行（手动/定时/CI触发）
       │
       ▼
2. 创建执行记录 (task_executions)
       │
       ▼
3. 获取任务关联的用例列表
       │
       ▼
4. 根据用例类型选择对应 Runner
       │
       ├─► API Runner ──────┐
       ├─► Newman Runner ───┤
       ├─► Pytest Runner ───┼──► 执行测试
       └─► Playwright ──────┘
                            │
                            ▼
5. 收集执行结果，写入 case_results
       │
       ▼
6. 更新执行记录状态和统计
       │
       ▼
7. 生成报告，触发通知（可选）
```

## 5. 数据库表调整

需要在 `test_cases` 表中增加配置字段：

```sql
-- 用例配置 JSON，根据 type 字段存储不同结构
config_json TEXT;

-- 示例：API 类型
{
  "method": "POST",
  "url": "/api/user/login",
  "headers": {"Content-Type": "application/json"},
  "body": {"username": "test", "password": "123456"},
  "assertions": [
    {"type": "status", "operator": "eq", "expected": 200},
    {"type": "jsonPath", "target": "$.code", "operator": "eq", "expected": 0}
  ]
}

-- 示例：Postman 类型
{
  "collectionId": "xxx",  // 或直接存储 collection JSON
  "environmentId": "xxx"
}

-- 示例：Pytest 类型
{
  "scriptPath": "tests/test_login.py",
  "args": ["-v", "--tb=short"]
}
```

## 6. 推荐实现顺序

1. **Phase 1**: 实现 HTTP Runner（最简单，立即可用）
2. **Phase 2**: 实现 Newman Runner（复用你之前的代码）
3. **Phase 3**: 实现 Pytest Runner（扩展能力）
4. **Phase 4**: 实现 Playwright Runner（UI 测试）

## 7. 目录结构

```
server/
├── db/                     # 数据库
├── runners/                # 执行引擎
│   ├── BaseRunner.ts       # 基础接口
│   ├── HttpRunner.ts       # HTTP API 执行器
│   ├── NewmanRunner.ts     # Postman 执行器
│   ├── PytestRunner.ts     # Python 执行器
│   └── PlaywrightRunner.ts # UI 执行器
├── services/
│   ├── ExecutionService.ts # 执行服务
│   ├── SchedulerService.ts # 调度服务
│   └── ReportService.ts    # 报告服务
├── routes/
│   ├── dashboard.ts        # 仪表盘 API
│   ├── cases.ts            # 用例管理 API
│   ├── tasks.ts            # 任务管理 API
│   └── executions.ts       # 执行管理 API
└── index.ts                # 入口文件
```
