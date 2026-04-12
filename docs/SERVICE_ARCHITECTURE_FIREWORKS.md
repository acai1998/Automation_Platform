# 🎆 Automation Platform 服务架构图

> 💡 **烟花技术架构图** - 以视觉化方式展示系统服务全景

---

## 🌟 核心服务全景图

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ff6b6b', 'primaryTextColor': '#fff', 'primaryBorderColor': '#ff6b6b', 'lineColor': '#4ecdc4', 'secondaryColor': '#45b7d1', 'tertiaryColor': '#f9ca24'}}}%%
graph TB
    subgraph CLIENT["🌐 客户端层"]
        Browser["🖥️ Web浏览器<br/>React SPA"]
        Mobile["📱 移动端<br/>规划中"]
    end

    subgraph FRONTEND["🎨 前端服务层"]
        subgraph UI["用户界面"]
            Dashboard["📊 仪表盘模块"]
            CaseModule["📝 用例管理模块"]
            TaskModule["⚙️ 任务调度模块"]
            ReportModule["📈 报告分析模块"]
            AIModule["🤖 AI生成模块"]
        end
        
        subgraph STATE["状态管理"]
            ReactQuery["🔄 React Query<br/>服务端状态"]
            Context["🎯 Context API<br/>全局状态"]
            WebSocket["⚡ Socket.IO Client<br/>实时状态"]
        end
    end

    subgraph GATEWAY["🚪 网关层"]
        Nginx["🌐 Nginx<br/>反向代理 & 负载均衡"]
    end

    subgraph BACKEND["⚙️ 后端服务层"]
        subgraph API["RESTful API"]
            AuthAPI["🔐 /api/auth<br/>认证服务"]
            CaseAPI["📋 /api/cases<br/>用例服务"]
            TaskAPI["⏰ /api/tasks<br/>任务服务"]
            ExecAPI["🚀 /api/executions<br/>执行服务"]
            DashboardAPI["📊 /api/dashboard<br/>仪表盘服务"]
            JenkinsAPI["🔧 /api/jenkins<br/>Jenkins集成"]
            AIAPI["🧠 /api/ai-cases<br/>AI生成服务"]
        end

        subgraph CORE["核心业务服务"]
            AuthService["🔐 认证服务<br/>JWT + bcrypt"]
            ExecutionEngine["🚀 执行引擎<br/>任务调度 & 监控"]
            TaskScheduler["⏰ 任务调度器<br/>Cron定时任务"]
            DashboardService["📊 仪表盘服务<br/>数据聚合 & 统计"]
        end

        subgraph INTEGRATION["集成服务"]
            JenkinsService["🔧 Jenkins集成<br/>Job触发 & 状态同步"]
            GitService["📦 Git服务<br/>代码同步"]
            EmailService["📧 邮件服务<br/>通知推送"]
        end

        subgraph AI["AI服务集群"]
            AIGenerator["🧠 AI生成引擎<br/>用例自动生成"]
            Embedding["🔢 向量化服务<br/>知识向量化"]
            KnowledgeRetrieval["📚 知识检索<br/>相似度匹配"]
        end

        subgraph REALTIME["实时通信"]
            WebSocketServer["⚡ WebSocket服务<br/>实时推送"]
        end
    end

    subgraph DATA["💾 数据层"]
        subgraph STORAGE["存储服务"]
            MySQL["🗄️ MySQL/MariaDB<br/>关系数据库"]
            Redis["⚡ Redis<br/>缓存规划中"]
        end
        
        subgraph REPO["数据访问层"]
            UserRepo["👤 用户仓储"]
            CaseRepo["📋 用例仓储"]
            TaskRepo["⏰ 任务仓储"]
            ExecRepo["🚀 执行仓储"]
        end
    end

    subgraph EXTERNAL["🌍 外部系统"]
        JenkinsServer["🔧 Jenkins服务器"]
        GitRepo["📦 Git仓库"]
        SMTPServer["📧 SMTP服务器"]
        AIModel["🤖 AI模型服务"]
    end

    subgraph INFRA["🏗️ 基础设施"]
        Docker["🐳 Docker容器"]
        PM2["🔄 PM2进程管理"]
        Jenkins["🔧 Jenkins CI/CD"]
    end

    %% 客户端到前端
    Browser --> Dashboard
    Browser --> CaseModule
    Browser --> TaskModule
    Mobile -.-> Dashboard

    %% 前端内部连接
    Dashboard --> ReactQuery
    CaseModule --> ReactQuery
    TaskModule --> ReactQuery
    AIModule --> Context
    
    ReactQuery --> WebSocket
    Context --> WebSocket

    %% 前端到网关
    Dashboard --> Nginx
    CaseModule --> Nginx
    TaskModule --> Nginx
    ReportModule --> Nginx
    AIModule --> Nginx

    %% 网关到API
    Nginx --> AuthAPI
    Nginx --> CaseAPI
    Nginx --> TaskAPI
    Nginx --> ExecAPI
    Nginx --> DashboardAPI
    Nginx --> JenkinsAPI
    Nginx --> AIAPI
    Nginx --> WebSocketServer

    %% API到服务
    AuthAPI --> AuthService
    CaseAPI --> AIGenerator
    TaskAPI --> TaskScheduler
    ExecAPI --> ExecutionEngine
    DashboardAPI --> DashboardService
    JenkinsAPI --> JenkinsService
    AIAPI --> AIGenerator

    %% 服务到数据访问层
    AuthService --> UserRepo
    ExecutionEngine --> ExecRepo
    TaskScheduler --> TaskRepo
    DashboardService --> ExecRepo
    AIGenerator --> CaseRepo

    %% 数据访问层到数据库
    UserRepo --> MySQL
    CaseRepo --> MySQL
    TaskRepo --> MySQL
    ExecRepo --> MySQL

    %% 服务间通信
    ExecutionEngine --> TaskScheduler
    JenkinsService --> ExecutionEngine
    WebSocketServer -.-> ExecutionEngine
    WebSocketServer -.-> TaskScheduler

    %% AI服务链
    AIGenerator --> Embedding
    Embedding --> KnowledgeRetrieval
    KnowledgeRetrieval --> CaseRepo

    %% 外部系统集成
    JenkinsService --> JenkinsServer
    GitService --> GitRepo
    EmailService --> SMTPServer
    AIGenerator --> AIModel
    ExecutionEngine --> GitRepo

    %% 基础设施
    Docker --> PM2

    %% 样式
    style CLIENT fill:#e1f5ff,stroke:#0066cc,stroke-width:3px
    style FRONTEND fill:#fff4e1,stroke:#ff9900,stroke-width:3px
    style GATEWAY fill:#ffe1e1,stroke:#ff0000,stroke-width:3px
    style BACKEND fill:#f0e1ff,stroke:#9900ff,stroke-width:3px
    style DATA fill:#e1ffe1,stroke:#00cc00,stroke-width:3px
    style EXTERNAL fill:#fff0f5,stroke:#ff69b4,stroke-width:3px
    style INFRA fill:#f5f5dc,stroke:#8b4513,stroke-width:3px
```

---

## 🔥 服务交互火焰图

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'darkMode': true, 'background': '#1a1a2e', 'primaryColor': '#ff6b6b', 'secondaryColor': '#4ecdc4', 'tertiaryColor': '#45b7d1'}}}%%
flowchart TD
    Start([🚀 用户请求]) --> Auth{🔐 认证检查}
    
    Auth -->|未认证| Login[📝 登录服务]
    Auth -->|已认证| Route{🔀 路由分发}
    
    Login --> JWT[🎫 生成JWT Token]
    JWT --> Cache[💾 缓存用户信息]
    Cache --> Response1([✅ 返回Token])
    
    Route -->|用例管理| CaseFlow[📋 用例处理流程]
    Route -->|任务执行| TaskFlow[⚙️ 任务执行流程]
    Route -->|AI生成| AIFlow[🤖 AI生成流程]
    Route -->|数据查询| QueryFlow[📊 数据查询流程]
    
    CaseFlow --> CaseValidate[✅ 参数验证]
    CaseValidate --> CaseRepo[🗄️ 用例仓储]
    CaseRepo --> CaseDB[(MySQL)]
    CaseDB --> CaseResponse([📋 返回用例数据])
    
    TaskFlow --> TaskSchedule[⏰ 任务调度]
    TaskSchedule --> Jenkins[🔧 Jenkins触发]
    Jenkins --> TaskMonitor[👁️ 执行监控]
    TaskMonitor --> WebSocket[⚡ 实时推送]
    WebSocket --> TaskResponse([🚀 执行状态更新])
    
    AIFlow --> Knowledge[📚 知识检索]
    Knowledge --> Embedding[🔢 向量化]
    Embedding --> LLM[🧠 AI模型调用]
    LLM --> CodeGen[💻 代码生成]
    CodeGen --> GitCommit[📦 Git提交]
    GitCommit --> AIResponse([🤖 返回生成结果])
    
    QueryFlow --> CacheCheck{💾 缓存检查}
    CacheCheck -->|命中| CacheHit([⚡ 返回缓存数据])
    CacheCheck -->|未命中| DBQuery[🗄️ 数据库查询]
    DBQuery --> UpdateCache[📝 更新缓存]
    UpdateCache --> QueryResponse([📊 返回查询结果])
    
    style Start fill:#ff6b6b,stroke:#fff,stroke-width:2px,color:#fff
    style Auth fill:#f9ca24,stroke:#fff,stroke-width:2px,color:#fff
    style Route fill:#45b7d1,stroke:#fff,stroke-width:2px,color:#fff
    style AIFlow fill:#a55eea,stroke:#fff,stroke-width:2px,color:#fff
    style TaskFlow fill:#26de81,stroke:#fff,stroke-width:2px,color:#fff
    style WebSocket fill:#fd9644,stroke:#fff,stroke-width:2px,color:#fff
```

---

## 💫 技术栈星系图

```mermaid
mindmap
  root((🚀 Automation<br/>Platform))
    🎨 前端技术
      React 18
        TypeScript
        Vite 5.0
      UI框架
        TailwindCSS
        Radix UI
        Lucide Icons
      状态管理
        React Query
        Context API
        Wouter路由
      实时通信
        Socket.IO Client
      可视化
        Recharts
        Mind Elixir
    
    ⚙️ 后端技术
      运行时
        Node.js 20
        Express 4.18
        TypeScript
      数据库
        TypeORM 0.3
        MySQL/MariaDB
        Redis规划中
      认证授权
        JWT
        bcrypt
        Rate Limit
      实时通信
        Socket.IO Server
      任务调度
        Croner
        任务队列
    
    🤖 AI能力
      大语言模型
        AI用例生成
        代码补全
      向量化
        Embedding
        知识检索
      知识库
        相似度匹配
        上下文增强
    
    🔧 DevOps
      容器化
        Docker
        多阶段构建
      CI/CD
        Jenkins
        自动化流水线
      进程管理
        PM2
        日志管理
      反向代理
        Nginx
        负载均衡
    
    📦 集成服务
      版本控制
        Git
        Simple Git
      持续集成
        Jenkins API
        构建触发
      通知服务
        Nodemailer
        SMTP
```

---

## 🎯 服务分层架构

```mermaid
graph BT
    subgraph L1["表现层 (Presentation Layer)"]
        P1["🖥️ Web UI<br/>React Components"]
        P2["📱 Mobile UI<br/>规划中"]
        P3["🔌 API Gateway<br/>Nginx"]
    end
    
    subgraph L2["应用层 (Application Layer)"]
        A1["🔐 认证应用服务"]
        A2["📋 用例管理服务"]
        A3["⚙️ 任务调度服务"]
        A4["📊 仪表盘服务"]
        A5["🤖 AI应用服务"]
    end
    
    subgraph L3["领域层 (Domain Layer)"]
        D1["👤 用户领域"]
        D2["📝 用例领域"]
        D3["⏰ 任务领域"]
        D4["🚀 执行领域"]
        D5["🤖 AI领域"]
    end
    
    subgraph L4["基础设施层 (Infrastructure Layer)"]
        I1["🗄️ 数据持久化<br/>TypeORM + MySQL"]
        I2["🌐 外部服务集成<br/>Jenkins + Git"]
        I3["⚡ 实时通信<br/>Socket.IO"]
        I4["📧 通知服务<br/>Email"]
    end
    
    L1 --> L2
    L2 --> L3
    L3 --> L4
    
    style L1 fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style L2 fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style L3 fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style L4 fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
```

---

## 🌊 数据流动态图

```mermaid
sequenceDiagram
    actor U as 👤 用户
    participant F as 🎨 前端
    participant G as 🚪 网关
    participant A as ⚙️ API服务
    participant S as 🔧 业务服务
    participant D as 💾 数据层
    participant W as ⚡ WebSocket
    participant E as 🌍 外部系统
    
    Note over U,E: 📋 用例管理流程
    U->>F: 创建测试用例
    F->>G: POST /api/cases
    G->>A: 路由到用例API
    A->>S: 调用用例服务
    S->>D: 持久化用例数据
    D-->>S: 返回用例ID
    S-->>A: 返回用例对象
    A-->>G: JSON响应
    G-->>F: HTTP 200
    F-->>U: 显示创建成功
    
    Note over U,E: 🚀 任务执行流程
    U->>F: 触发任务执行
    F->>G: POST /api/executions
    G->>A: 执行API
    A->>S: 执行服务
    S->>D: 创建执行记录
    S->>E: 触发Jenkins Job
    E-->>S: 返回Build号
    S->>W: 推送开始状态
    W-->>F: 实时更新UI
    F-->>U: 显示执行进度
    
    loop 执行监控
        E->>S: 状态回调
        S->>D: 更新执行状态
        S->>W: 推送进度
        W-->>F: 更新进度条
    end
    
    E->>S: 执行完成
    S->>D: 保存结果
    S->>W: 推送完成通知
    W-->>F: 显示完成状态
    F-->>U: 展示测试报告
```

---

## 🔥 服务依赖矩阵

```mermaid
graph LR
    subgraph CORE["核心服务"]
        Auth[🔐 认证]
        Case[📋 用例]
        Task[⏰ 任务]
        Exec[🚀 执行]
    end
    
    subgraph SUPPORT["支撑服务"]
        DB[💾 数据库]
        Cache[⚡ 缓存]
        Queue[📦 队列]
        Log[📝 日志]
    end
    
    subgraph EXTERNAL["外部依赖"]
        Jenkins[🔧 Jenkins]
        Git[📦 Git]
        AI[🤖 AI]
        Email[📧 Email]
    end
    
    Auth --> DB
    Auth --> Cache
    Auth --> Log
    
    Case --> DB
    Case --> Cache
    Case --> Git
    Case --> AI
    Case --> Log
    
    Task --> DB
    Task --> Queue
    Task --> Jenkins
    Task --> Log
    
    Exec --> DB
    Exec --> Queue
    Exec --> Jenkins
    Exec --> Git
    Exec --> Log
    
    style Auth fill:#ff6b6b,stroke:#fff,stroke-width:2px,color:#fff
    style Case fill:#4ecdc4,stroke:#fff,stroke-width:2px,color:#fff
    style Task fill:#45b7d1,stroke:#fff,stroke-width:2px,color:#fff
    style Exec fill:#f9ca24,stroke:#fff,stroke-width:2px,color:#fff
```

---

## 📊 服务健康度监控

```mermaid
graph TB
    subgraph METRICS["监控指标"]
        M1["📈 请求量<br/>QPS: 1000+"]
        M2["⏱️ 响应时间<br/>P99: <500ms"]
        M3["✅ 成功率<br/>99.9%"]
        M4["⚠️ 错误率<br/><0.1%"]
    end
    
    subgraph ALERTS["告警规则"]
        A1["🔴 服务宕机<br/>立即告警"]
        A2["🟡 响应慢<br/>P99>1s"]
        A3["🟡 错误多<br/>错误率>1%"]
        A4["🟢 资源高<br/>CPU>80%"]
    end
    
    subgraph ACTIONS["自动处理"]
        AC1["🔄 自动重启"]
        AC2["📈 自动扩容"]
        AC3["📧 邮件通知"]
        AC4["💬 钉钉通知"]
    end
    
    METRICS --> ALERTS
    ALERTS --> ACTIONS
    
    style METRICS fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style ALERTS fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style ACTIONS fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
```

---

## 🎨 技术选型对比

| 分类 | 技术选型 | 备选方案 | 选择理由 |
|------|---------|---------|---------|
| **前端框架** | React 18 | Vue 3, Angular | 生态成熟、组件丰富、团队熟悉 |
| **构建工具** | Vite | Webpack, Parcel | 开发体验好、构建速度快 |
| **状态管理** | React Query | Redux, MobX | 服务端状态管理优秀、缓存机制完善 |
| **UI框架** | TailwindCSS + Radix | Ant Design, MUI | 高度可定制、性能优秀 |
| **后端框架** | Express | Koa, NestJS | 生态成熟、中间件丰富 |
| **ORM** | TypeORM | Prisma, Sequelize | TypeScript支持好、装饰器语法优雅 |
| **数据库** | MySQL | PostgreSQL, MongoDB | 关系型数据、事务支持完善 |
| **实时通信** | Socket.IO | WebSocket, SSE | 双向通信、自动重连、房间管理 |
| **容器化** | Docker | Podman, LXC | 生态完善、CI/CD集成好 |
| **CI/CD** | Jenkins | GitLab CI, GitHub Actions | 功能强大、插件丰富 |

---

## 🚀 性能优化策略

### 前端优化
- ✅ 代码分割（React.lazy + Suspense）
- ✅ 资源懒加载
- ✅ 虚拟滚动（@tanstack/react-virtual）
- ✅ 缓存策略（React Query staleTime）
- ✅ 防抖节流

### 后端优化
- ✅ 数据库索引优化
- ✅ 查询优化（避免N+1问题）
- ✅ 连接池管理
- ✅ 异步处理（Promise.all）
- ✅ 缓存热点数据

### 网络优化
- ✅ Gzip压缩
- ✅ CDN加速
- ✅ HTTP/2
- ✅ WebSocket长连接

---

## 🔐 安全架构

```mermaid
graph TB
    subgraph CLIENT["客户端安全"]
        C1["🔒 HTTPS加密"]
        C2["🎫 JWT存储<br/>HttpOnly Cookie"]
        C3["🛡️ XSS防护<br/>React自动转义"]
        C4["🔐 CSRF防护<br/>Token验证"]
    end
    
    subgraph SERVER["服务端安全"]
        S1["🔐 密码加密<br/>bcrypt"]
        S2["⏰ 速率限制<br/>express-rate-limit"]
        S3["🛡️ SQL注入防护<br/>TypeORM参数化"]
        S4["🔑 权限验证<br/>RBAC"]
    end
    
    subgraph DATA["数据安全"]
        D1["💾 数据库加密"]
        D2["🔒 敏感数据脱敏"]
        D3["📝 审计日志"]
        D4["🔑 密钥管理"]
    end
    
    CLIENT --> SERVER
    SERVER --> DATA
    
    style CLIENT fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style SERVER fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style DATA fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
```

---

## 📈 扩展性设计

### 水平扩展
- 🔄 无状态服务设计
- 🔄 负载均衡（Nginx）
- 🔄 会话共享（Redis）
- 🔄 数据库读写分离

### 垂直扩展
- 📦 微服务拆分
- 📦 服务网格（规划中）
- 📦 消息队列（规划中）
- 📦 分布式追踪（规划中）

### 功能扩展
- 🔌 插件化架构
- 🔌 钩子机制
- 🔌 自定义扩展点
- 🔌 配置驱动

---

## 🎯 服务SLA

| 服务 | 可用性目标 | 响应时间目标 | 备注 |
|------|-----------|-------------|------|
| **认证服务** | 99.99% | <200ms | 核心服务 |
| **用例服务** | 99.95% | <300ms | 核心服务 |
| **任务服务** | 99.90% | <500ms | 核心服务 |
| **执行服务** | 99.90% | <1000ms | 资源密集 |
| **AI服务** | 99.00% | <5000ms | 依赖外部AI |
| **Jenkins集成** | 99.00% | 不定 | 依赖Jenkins |

---

**文档版本**: v1.0  
**创建时间**: 2024年  
**维护团队**: Automation Platform Team  
**架构图风格**: 🎆 烟花技术架构图
