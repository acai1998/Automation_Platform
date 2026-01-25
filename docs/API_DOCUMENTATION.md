# 自动化测试平台 API 接口文档

## 目录
- [概述](#概述)
- [认证与安全](#认证与安全)
- [通用响应格式](#通用响应格式)
- [错误处理](#错误处理)
- [Jenkins 集成 API](#jenkins-集成-api)
- [执行管理 API](#执行管理-api)
- [测试用例管理 API](#测试用例管理-api)
- [任务管理 API](#任务管理-api)
- [仪表盘分析 API](#仪表盘分析-api)
- [用户认证 API](#用户认证-api)
- [代码库管理 API](#代码库管理-api)
- [数据模型与类型定义](#数据模型与类型定义)
- [集成指南](#集成指南)
- [故障排除](#故障排除)

---

## 概述

本文档详细描述了自动化测试平台的所有 API 接口，包括完整的请求/响应模式、认证要求和使用示例。

### 基础信息
- **API 基础 URL**: `http://localhost:3000/api`
- **协议**: HTTP/HTTPS
- **数据格式**: JSON
- **字符编码**: UTF-8
- **API 版本**: v1 (当前版本)

### 平台架构
- **前端**: React 18 + TypeScript + Vite (端口 5173)
- **后端**: Express + TypeScript (端口 3000)
- **数据库**: MariaDB
- **外部集成**: Jenkins (测试执行引擎)

---

## 认证与安全

### 1. JWT Token 认证
用于平台内部用户认证，适用于前端应用和需要用户身份的 API 调用。

```http
Authorization: Bearer <jwt_token>
```

### 2. Jenkins 回调认证
用于 Jenkins 系统回调平台接口，支持三种认证方式：

#### 2.1 API Key 认证
```http
X-Api-Key: <jenkins_api_key>
```

#### 2.2 JWT Token 认证
```http
Authorization: Bearer <jenkins_jwt_token>
```

#### 2.3 签名认证
```http
X-Jenkins-Signature: <hmac_signature>
X-Jenkins-Timestamp: <unix_timestamp>
```

### 3. 限流策略
- Jenkins 回调接口：每分钟最多 100 次请求
- 普通 API 接口：每分钟最多 1000 次请求

---

## 通用响应格式

### 成功响应
```json
{
  "success": true,
  "data": {
    // 响应数据
  },
  "message": "操作成功"
}
```

### 错误响应
```json
{
  "success": false,
  "message": "错误描述",
  "details": ["详细错误信息"],
  "error": "ERROR_CODE"
}
```

### HTTP 状态码
- `200` - 请求成功
- `201` - 创建成功
- `400` - 请求参数错误
- `401` - 认证失败
- `403` - 权限不足
- `404` - 资源不存在
- `429` - 请求频率超限
- `500` - 服务器内部错误

---

## 错误处理

### 常见错误类型

#### 1. 参数验证错误 (400)
```json
{
  "success": false,
  "message": "参数验证失败",
  "details": [
    "caseIds 不能为空",
    "projectId 必须是正整数"
  ],
  "error": "VALIDATION_ERROR"
}
```

#### 2. 认证错误 (401)
```json
{
  "success": false,
  "message": "认证失败",
  "error": "AUTHENTICATION_FAILED"
}
```

#### 3. 资源不存在 (404)
```json
{
  "success": false,
  "message": "执行记录不存在",
  "error": "EXECUTION_NOT_FOUND"
}
```

#### 4. 限流错误 (429)
```json
{
  "success": false,
  "message": "请求频率过高，请稍后重试",
  "error": "RATE_LIMIT_EXCEEDED"
}
```

---

## Jenkins 集成 API

Jenkins 集成是平台的核心功能，提供测试执行触发、状态回调、健康检查等完整的集成能力。

### 基础路径
所有 Jenkins 集成 API 的基础路径为：`/api/jenkins`

---

### 1. 触发 Jenkins 任务执行

#### `POST /api/jenkins/trigger`

触发 Jenkins Job 执行，创建执行记录并启动测试任务。

**请求参数**
```json
{
  "taskId": 123,                    // 必需，任务ID
  "triggeredBy": 1,                 // 可选，触发用户ID，默认1
  "jenkinsJobName": "test-job"      // 可选，Jenkins任务名称
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "executionId": 456,
    "totalCases": 25,
    "status": "pending",
    "jenkinsJobName": "automation-test-job",
    "message": "执行任务已创建，等待Jenkins启动"
  }
}
```

**错误响应**
```json
{
  "success": false,
  "message": "任务不存在或已禁用",
  "error": "TASK_NOT_FOUND"
}
```

---

### 2. 单个用例执行

#### `POST /api/jenkins/run-case`

触发单个测试用例的执行。

**中间件**: 限流、请求验证

**请求参数**
```json
{
  "caseId": 789,        // 必需，用例ID (≥1)
  "projectId": 1,       // 必需，项目ID (≥1)
  "triggeredBy": 2      // 可选，触发用户ID (≥1)
}
```

**验证规则**
- `caseId`: 必需，正整数，最小值1
- `projectId`: 必需，正整数，最小值1
- `triggeredBy`: 可选，正整数，最小值1

**响应示例**
```json
{
  "success": true,
  "data": {
    "runId": 12345,
    "buildUrl": "http://jenkins.example.com/job/test/123/"
  },
  "message": "用例执行已启动"
}
```

---

### 3. 批量用例执行

#### `POST /api/jenkins/run-batch`

触发多个测试用例的批量执行。

**中间件**: 限流、请求验证

**请求参数**
```json
{
  "caseIds": [1, 2, 3, 4, 5],    // 必需，用例ID数组
  "projectId": 1,                // 必需，项目ID (≥1)
  "triggeredBy": 2               // 可选，触发用户ID (≥1)
}
```

**验证规则**
- `caseIds`: 必需，非空数组，最多100个元素，不能重复
- `projectId`: 必需，正整数，最小值1
- `triggeredBy`: 可选，正整数，最小值1

**响应示例**
```json
{
  "success": true,
  "data": {
    "runId": 12346,
    "totalCases": 5,
    "buildUrl": "http://jenkins.example.com/job/batch-test/124/"
  },
  "message": "批量执行已启动"
}
```

---

### 4. 获取任务关联用例

#### `GET /api/jenkins/tasks/:taskId/cases`

获取指定任务关联的测试用例列表，供 Jenkins 获取执行用例。

**路径参数**
- `taskId`: 任务ID

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "登录功能测试",
      "type": "api",
      "priority": "P1",
      "module": "auth",
      "enabled": true,
      "script_path": "/tests/auth/login.js"
    },
    {
      "id": 2,
      "name": "用户注册测试",
      "type": "api",
      "priority": "P2",
      "module": "auth",
      "enabled": true,
      "script_path": "/tests/auth/register.js"
    }
  ]
}
```

---

### 5. 查询执行状态

#### `GET /api/jenkins/status/:executionId`

查询指定执行的状态信息。

**路径参数**
- `executionId`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "executionId": 456,
    "status": "running",
    "totalCases": 25,
    "passedCases": 15,
    "failedCases": 2,
    "skippedCases": 0,
    "startTime": "2024-01-19T10:00:00Z",
    "endTime": null,
    "duration": null,
    "jenkinsStatus": null,
    "buildNumber": null,
    "consoleUrl": null
  }
}
```

---

### 6. Jenkins 执行结果回调

#### `POST /api/jenkins/callback`

Jenkins 执行完成后回调接口，上报执行结果。

**中间件**: Jenkins认证、限流、请求验证

**请求参数**
```json
{
  "runId": 12345,                    // 必需，执行ID (≥1)
  "status": "success",               // 必需，执行状态
  "passedCases": 20,                 // 可选，通过用例数 (≥0)
  "failedCases": 3,                  // 可选，失败用例数 (≥0)
  "skippedCases": 2,                 // 可选，跳过用例数 (≥0)
  "durationMs": 120000,              // 可选，执行时长(毫秒，0-86400000)
  "results": [                       // 可选，详细结果数组
    {
      "caseId": 1,
      "caseName": "登录功能测试",
      "status": "passed",
      "duration": 1500,
      "errorMessage": null,
      "stackTrace": null,
      "screenshotPath": null,
      "logPath": "/logs/case1.log",
      "assertionsTotal": 5,
      "assertionsPassed": 5,
      "responseData": "{\"code\":200}"
    },
    {
      "caseId": 2,
      "caseName": "密码错误测试",
      "status": "failed",
      "duration": 800,
      "errorMessage": "断言失败：期望状态码401，实际200",
      "stackTrace": "AssertionError: expected 401 to equal 200...",
      "screenshotPath": "/screenshots/case2.png",
      "logPath": "/logs/case2.log",
      "assertionsTotal": 3,
      "assertionsPassed": 2,
      "responseData": "{\"code\":200,\"message\":\"success\"}"
    }
  ]
}
```

**验证规则**
- `runId`: 必需，正整数，最小值1
- `status`: 必需，枚举值 ['success', 'failed', 'aborted']
- `passedCases`, `failedCases`, `skippedCases`: 可选，非负整数
- `durationMs`: 可选，0-86400000毫秒（24小时内）
- `results`: 可选，结果数组，长度必须等于各状态用例数之和
- 每个结果对象的 `assertionsPassed` 不能超过 `assertionsTotal`

**响应示例**
```json
{
  "success": true,
  "message": "执行结果已更新",
  "processingTimeMs": 45
}
```

---

### 7. 获取批量执行详情

#### `GET /api/jenkins/batch/:runId`

获取指定批量执行的详细信息。

**路径参数**
- `runId`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "status": "success",
    "total_cases": 25,
    "passed_cases": 22,
    "failed_cases": 2,
    "skipped_cases": 1,
    "duration_ms": 180000,
    "start_time": "2024-01-19T10:00:00Z",
    "end_time": "2024-01-19T10:03:00Z",
    "jenkins_job": "automation-test-job",
    "jenkins_build_id": "123",
    "jenkins_url": "http://jenkins.example.com/job/automation-test-job/123/",
    "trigger_by_name": "张三"
  }
}
```

---

### 8. 回调连接测试

#### `POST /api/jenkins/callback/test`

测试 Jenkins 回调连接和认证，支持连接测试和真实数据测试两种模式。

**中间件**: Jenkins认证、限流

**连接测试模式请求**
```json
{
  "testMessage": "Jenkins连接测试"
}
```

**真实数据测试模式请求**
```json
{
  "testMessage": "真实数据测试",
  "runId": 12345,
  "status": "success",
  "passedCases": 5,
  "failedCases": 0,
  "skippedCases": 1,
  "durationMs": 30000,
  "results": [...]
}
```

**连接测试响应**
```json
{
  "success": true,
  "message": "Jenkins回调连接测试成功",
  "mode": "CONNECTION_TEST",
  "details": {
    "receivedAt": "2024-01-19T10:00:00Z",
    "authenticationMethod": "jwt",
    "clientIP": "192.168.1.100",
    "testMessage": "Jenkins连接测试",
    "metadata": {
      "userAgent": "Jenkins/2.401.3",
      "contentType": "application/json"
    }
  },
  "diagnostics": {
    "platform": "Jenkins 2.401.3",
    "jenkinsUrl": "http://jenkins.example.com",
    "callbackReceived": true,
    "authenticationPassed": true,
    "networkConnectivity": "正常",
    "timestamp": "2024-01-19T10:00:00Z"
  },
  "recommendations": [
    "连接状态良好，可以正常接收回调",
    "建议定期测试回调连接"
  ]
}
```

**真实数据测试响应**
```json
{
  "success": true,
  "message": "真实数据处理测试成功",
  "mode": "REAL_DATA",
  "details": {
    "receivedAt": "2024-01-19T10:00:00Z",
    "authenticationMethod": "jwt",
    "clientIP": "192.168.1.100",
    "testMessage": "真实数据测试",
    "metadata": {},
    "processedData": {
      "runId": 12345,
      "status": "success",
      "passedCases": 5,
      "failedCases": 0,
      "skippedCases": 1,
      "durationMs": 30000,
      "resultsCount": 6
    }
  },
  "diagnostics": {
    "platform": "Jenkins 2.401.3",
    "jenkinsUrl": "http://jenkins.example.com",
    "callbackReceived": true,
    "authenticationPassed": true,
    "networkConnectivity": "正常",
    "dataProcessing": "成功",
    "timestamp": "2024-01-19T10:00:00Z",
    "processingTimeMs": 25
  },
  "recommendations": [
    "数据处理正常，回调功能完整",
    "可以开始正式使用回调接口"
  ]
}
```

---

### 9. 手动同步执行状态

#### `POST /api/jenkins/callback/manual-sync/:runId`

手动同步执行状态，用于修复卡住的执行记录。

**中间件**: Jenkins认证、限流

**路径参数**
- `runId`: 执行记录ID

**请求参数**
```json
{
  "status": "failed",               // 必需，执行状态
  "passedCases": 10,               // 可选，通过用例数，默认0
  "failedCases": 3,                // 可选，失败用例数，默认0
  "skippedCases": 2,               // 可选，跳过用例数，默认0
  "durationMs": 150000,            // 可选，执行时长，默认0
  "results": [...],                // 可选，详细结果数组
  "force": false                   // 可选，是否强制更新，默认false
}
```

**响应示例**
```json
{
  "success": true,
  "message": "执行状态已手动同步",
  "previous": {
    "id": 12345,
    "status": "running",
    "totalCases": 15,
    "passedCases": 0,
    "failedCases": 0,
    "skippedCases": 0
  },
  "updated": {
    "id": 12345,
    "status": "failed",
    "totalCases": 15,
    "passedCases": 10,
    "failedCases": 3,
    "skippedCases": 2,
    "endTime": "2024-01-19T10:05:00Z",
    "durationMs": 150000
  },
  "timing": {
    "processingTimeMs": 35,
    "timestamp": "2024-01-19T10:05:00Z"
  }
}
```

---

### 10. 回调诊断

#### `POST /api/jenkins/callback/diagnose`

诊断 Jenkins 回调连接问题，无需认证。

**请求参数**: 任意或空

**响应示例**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-19T10:00:00Z",
    "clientIP": "192.168.1.100",
    "environmentVariablesConfigured": {
      "jenkins_url": true,
      "jenkins_user": true,
      "jenkins_token": true,
      "jenkins_api_key": true,
      "jenkins_jwt_secret": false,
      "jenkins_signature_secret": true,
      "jenkins_allowed_ips": false
    },
    "requestHeaders": {
      "hasAuthorization": false,
      "hasApiKey": true,
      "hasSignature": false,
      "hasTimestamp": false,
      "hasContentType": true
    },
    "suggestions": [
      "检测到API Key认证头，建议配置对应的环境变量",
      "未检测到JWT认证，如需使用JWT请配置jenkins_jwt_secret",
      "建议配置jenkins_allowed_ips限制回调来源IP"
    ]
  },
  "message": "诊断完成"
}
```

---

### 11. Jenkins 健康检查

#### `GET /api/jenkins/health`

检查 Jenkins 连接健康状态，包含详细的诊断信息。

**响应示例**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "jenkinsUrl": "http://jenkins.example.com",
    "version": "2.401.3",
    "timestamp": "2024-01-19T10:00:00Z",
    "details": {
      "timestamp": "2024-01-19T10:00:00Z",
      "duration": 245,
      "checks": {
        "connectionTest": {
          "success": true,
          "duration": 120
        },
        "authenticationTest": {
          "success": true,
          "duration": 85
        },
        "apiResponseTest": {
          "success": true,
          "duration": 40
        }
      },
      "diagnostics": {
        "configPresent": {
          "url": true,
          "user": true,
          "token": true
        },
        "connectionStatus": 200,
        "statusText": "OK"
      },
      "issues": [],
      "recommendations": [
        "Jenkins连接正常",
        "建议定期检查连接状态"
      ]
    }
  },
  "message": "Jenkins连接正常"
}
```

**连接失败响应**
```json
{
  "success": false,
  "data": {
    "connected": false,
    "jenkinsUrl": "http://jenkins.example.com",
    "timestamp": "2024-01-19T10:00:00Z",
    "details": {
      "timestamp": "2024-01-19T10:00:00Z",
      "duration": 5000,
      "checks": {
        "connectionTest": {
          "success": false,
          "duration": 5000
        },
        "authenticationTest": {
          "success": false,
          "duration": 0
        },
        "apiResponseTest": {
          "success": false,
          "duration": 0
        }
      },
      "diagnostics": {
        "configPresent": {
          "url": true,
          "user": true,
          "token": false
        }
      },
      "issues": [
        "Jenkins认证token未配置",
        "连接超时"
      ],
      "recommendations": [
        "检查JENKINS_TOKEN环境变量配置",
        "确认Jenkins服务是否正常运行",
        "检查网络连接"
      ]
    }
  },
  "message": "Jenkins连接失败"
}
```

---

### 12. 执行诊断

#### `GET /api/jenkins/diagnose?runId=<number>`

诊断特定执行的问题。

**查询参数**
- `runId`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "executionId": 12345,
    "status": "running",
    "jenkinsJob": "automation-test-job",
    "jenkinsBuildId": "123",
    "jenkinsUrl": "http://jenkins.example.com/job/automation-test-job/123/",
    "startTime": "2024-01-19T10:00:00Z",
    "createdAt": "2024-01-19T09:59:55Z",
    "totalCases": 25,
    "passedCases": 0,
    "failedCases": 0,
    "skippedCases": 0,
    "executionDuration": 300000,
    "diagnostics": {
      "jenkinsInfoMissing": false,
      "startTimeMissing": false,
      "stillPending": false,
      "stillRunning": true,
      "noTestResults": true,
      "longRunning": true,
      "veryLongRunning": false,
      "jenkinsConnectivity": {
        "canConnect": true,
        "buildStatus": {
          "building": false,
          "result": "SUCCESS",
          "duration": 280000,
          "url": "http://jenkins.example.com/job/automation-test-job/123/"
        }
      },
      "timeAnalysis": {
        "executionAge": 300000,
        "executionAgeMinutes": 5,
        "isOld": false,
        "createdRecently": true
      },
      "suggestions": [
        "Jenkins构建已完成但平台状态未更新",
        "建议手动同步执行状态",
        "检查Jenkins回调配置是否正确"
      ]
    }
  }
}
```

---

### 13. 监控统计

#### `GET /api/jenkins/monitoring/stats`

获取 Jenkins 集成的监控统计数据。

**响应示例**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-19T10:00:00Z",
    "syncService": {
      "success": 245,
      "failed": 3,
      "timeout": 2,
      "total": 250
    },
    "executions": {
      "total": 1250,
      "byStatus": {
        "pending": 5,
        "running": 12,
        "success": 1180,
        "failed": 48,
        "aborted": 5
      },
      "stuck": 3,
      "stuckList": [
        {
          "id": 12340,
          "status": "running",
          "duration": 1800000,
          "jenkins_job": "test-job-1",
          "jenkins_build_id": "120"
        },
        {
          "id": 12341,
          "status": "pending",
          "duration": 900000,
          "jenkins_job": null,
          "jenkins_build_id": null
        }
      ]
    },
    "health": {
      "totalIssues": 3,
      "hasIssues": true
    }
  }
}
```

---

### 14. 修复卡住的执行

#### `POST /api/jenkins/monitoring/fix-stuck`

自动修复卡住的执行记录。

**请求参数**
```json
{
  "timeoutMinutes": 5,        // 可选，超时分钟数，默认5
  "dryRun": false            // 可选，是否试运行，默认false
}
```

**试运行响应**
```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "wouldFix": 3,
    "executions": [
      {
        "id": 12340,
        "status": "running",
        "jenkins_job": "test-job-1",
        "jenkins_build_id": "120",
        "jenkins_url": "http://jenkins.example.com/job/test-job-1/120/",
        "start_time": "2024-01-19T09:30:00Z",
        "duration_minutes": 30
      }
    ]
  }
}
```

**实际修复响应**
```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "checked": 15,
    "updated": 3,
    "timedOut": 2,
    "message": "已修复3个卡住的执行，其中2个超时"
  }
}
```

---

## 执行管理 API

执行管理 API 提供测试执行记录的生命周期管理，包括状态查询、结果获取、同步和故障修复等功能。

### 基础路径
所有执行管理 API 的基础路径为：`/api/executions`

---

### 1. 获取执行记录列表

#### `GET /api/executions`

获取最近的测试执行记录列表。

**查询参数**
```json
{
  "limit": 20        // 可选，返回记录数，默认20
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "status": "success",
      "total_cases": 25,
      "passed_cases": 23,
      "failed_cases": 2,
      "skipped_cases": 0,
      "start_time": "2024-01-19T10:00:00Z",
      "executed_by_name": "张三"
    },
    {
      "id": 12344,
      "status": "running",
      "total_cases": 15,
      "passed_cases": 0,
      "failed_cases": 0,
      "skipped_cases": 0,
      "start_time": "2024-01-19T09:45:00Z",
      "executed_by_name": "李四"
    }
  ]
}
```

---

### 2. 获取执行详情

#### `GET /api/executions/:id`

获取指定执行的详细信息，包括执行记录和所有测试用例结果。

**路径参数**
- `id`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "execution": {
      "id": 12345,
      "status": "success",
      "total_cases": 25,
      "passed_cases": 23,
      "failed_cases": 2,
      "skipped_cases": 0,
      "start_time": "2024-01-19T10:00:00Z",
      "end_time": "2024-01-19T10:05:30Z",
      "duration": 330000,
      "executed_by_name": "张三"
    },
    "results": [
      {
        "id": 1001,
        "execution_id": 12345,
        "case_id": 1,
        "case_name": "登录功能测试",
        "status": "passed",
        "duration": 1500,
        "error_message": null,
        "module": "auth",
        "priority": "P1",
        "type": "api"
      },
      {
        "id": 1002,
        "execution_id": 12345,
        "case_id": 2,
        "case_name": "密码错误测试",
        "status": "failed",
        "duration": 800,
        "error_message": "断言失败：期望状态码401，实际200",
        "module": "auth",
        "priority": "P2",
        "type": "api"
      }
    ]
  }
}
```

---

### 3. 获取执行结果

#### `GET /api/executions/:id/results`

获取指定执行的测试用例结果列表。

**路径参数**
- `id`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 1001,
      "execution_id": 12345,
      "case_id": 1,
      "case_name": "登录功能测试",
      "status": "passed",
      "duration": 1500,
      "error_message": null,
      "module": "auth",
      "priority": "P1",
      "type": "api"
    },
    {
      "id": 1002,
      "execution_id": 12345,
      "case_id": 2,
      "case_name": "密码错误测试",
      "status": "failed",
      "duration": 800,
      "error_message": "断言失败：期望状态码401，实际200",
      "module": "auth",
      "priority": "P2",
      "type": "api"
    }
  ]
}
```

---

### 4. 标记执行开始

#### `POST /api/executions/:id/start`

标记执行为运行状态，通常由 Jenkins 在开始执行时调用。

**路径参数**
- `id`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "message": "执行已标记为运行状态"
}
```

**错误响应**
```json
{
  "success": false,
  "message": "执行记录不存在",
  "error": "EXECUTION_NOT_FOUND"
}
```

---

### 5. Jenkins 执行结果回调 (遗留)

#### `POST /api/executions/callback`

Jenkins 执行结果回调的遗留接口，建议使用 `/api/jenkins/callback`。

**请求参数**
```json
{
  "executionId": 12345,          // 必需，执行ID
  "status": "success",           // 必需，执行状态
  "results": [...],              // 必需，结果数组
  "duration": 300000,            // 可选，执行时长，默认0
  "reportUrl": "http://..."      // 可选，报告URL
}
```

**响应示例**
```json
{
  "success": true,
  "message": "执行结果已更新"
}
```

---

### 6. 手动同步执行状态

#### `POST /api/executions/:id/sync`

从 Jenkins 手动同步指定执行的状态。

**路径参数**
- `id`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "updated": true,
    "message": "执行状态已同步",
    "currentStatus": "success",
    "jenkinsStatus": "SUCCESS",
    "executionId": 12345
  }
}
```

**未找到Jenkins构建响应**
```json
{
  "success": true,
  "data": {
    "updated": false,
    "message": "未找到对应的Jenkins构建",
    "currentStatus": "running",
    "jenkinsStatus": null,
    "executionId": 12345
  }
}
```

---

### 7. 批量同步卡住的执行

#### `POST /api/executions/sync-stuck`

批量同步长时间未更新的执行记录。

**请求参数**
```json
{
  "timeoutMinutes": 10,         // 可选，超时分钟数，默认10
  "maxExecutions": 20           // 可选，最大处理数量，默认20
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "checked": 15,
    "timedOut": 3,
    "updated": 2,
    "timeoutMinutes": 10,
    "message": "已检查15个执行，发现3个超时，成功更新2个"
  }
}
```

---

### 8. 获取卡住的执行列表

#### `GET /api/executions/stuck`

获取可能卡住的执行记录列表。

**查询参数**
```json
{
  "timeout": 10                 // 可选，超时分钟数，默认10
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "executions": [
      {
        "id": 12340,
        "status": "running",
        "jenkins_job": "automation-test-job",
        "jenkins_build_id": "120",
        "jenkins_url": "http://jenkins.example.com/job/automation-test-job/120/",
        "start_time": "2024-01-19T09:30:00Z",
        "duration_minutes": 35,
        "trigger_by_name": "张三"
      },
      {
        "id": 12341,
        "status": "pending",
        "jenkins_job": null,
        "jenkins_build_id": null,
        "jenkins_url": null,
        "start_time": "2024-01-19T09:45:00Z",
        "duration_minutes": 20,
        "trigger_by_name": "李四"
      }
    ],
    "timeoutMinutes": 10,
    "count": 2
  }
}
```

---

### 9. 取消执行

#### `POST /api/executions/:id/cancel`

取消正在进行的执行。

**路径参数**
- `id`: 执行记录ID

**响应示例**
```json
{
  "success": true,
  "message": "执行已取消"
}
```

**错误响应**
```json
{
  "success": false,
  "message": "只能取消pending或running状态的执行",
  "error": "INVALID_STATUS"
}
```

---

### 10. 获取测试运行记录

#### `GET /api/executions/test-runs`

获取 Auto_TestRun 表的记录，用于查看原始执行数据。

**查询参数**
```json
{
  "limit": 50,                  // 可选，返回记录数，默认50
  "offset": 0                   // 可选，偏移量，默认0
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 1001,
      "run_name": "API自动化测试-20240119",
      "run_description": "登录模块测试",
      "status": "completed",
      "total_cases": 25,
      "passed_cases": 23,
      "failed_cases": 2,
      "skipped_cases": 0,
      "start_time": "2024-01-19T10:00:00Z",
      "end_time": "2024-01-19T10:05:30Z",
      "created_by": 1,
      "created_at": "2024-01-19T09:59:55Z"
    }
  ],
  "total": 1250
}
```

---

## 测试用例管理 API

测试用例管理 API 提供测试用例的完整生命周期管理，包括 CRUD 操作、分类筛选、执行触发等功能。

### 基础路径
所有测试用例管理 API 的基础路径为：`/api/cases`

---

### 1. 获取测试用例列表

#### `GET /api/cases`

获取测试用例列表，支持多种筛选条件。

**查询参数**
```json
{
  "projectId": 1,              // 可选，项目ID筛选
  "module": "auth",            // 可选，模块筛选
  "enabled": "true",           // 可选，启用状态筛选 (true/false/1/0)
  "type": "api",               // 可选，用例类型筛选
  "search": "登录",            // 可选，关键词搜索
  "limit": 50,                 // 可选，返回记录数，默认50
  "offset": 0                  // 可选，偏移量，默认0
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "case_key": "TC001",
      "name": "登录功能测试",
      "description": "测试用户登录功能的正常流程",
      "project_id": 1,
      "project_name": "电商平台",
      "repo_id": 1,
      "module": "auth",
      "priority": "P1",
      "type": "api",
      "tags": "登录,认证,核心功能",
      "owner": "张三",
      "source": "manual",
      "enabled": true,
      "last_sync_commit": "abc123def",
      "script_path": "/tests/auth/login.js",
      "config_json": "{\"timeout\": 5000}",
      "created_by": 1,
      "created_by_name": "管理员",
      "updated_by": 1,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-19T09:30:00Z"
    },
    {
      "id": 2,
      "case_key": "TC002",
      "name": "密码错误登录测试",
      "description": "测试输入错误密码时的处理",
      "project_id": 1,
      "project_name": "电商平台",
      "repo_id": 1,
      "module": "auth",
      "priority": "P2",
      "type": "api",
      "tags": "登录,异常处理",
      "owner": "李四",
      "source": "sync",
      "enabled": true,
      "last_sync_commit": "def456ghi",
      "script_path": "/tests/auth/login_error.js",
      "config_json": null,
      "created_by": 1,
      "created_by_name": "管理员",
      "updated_by": 2,
      "created_at": "2024-01-15T10:05:00Z",
      "updated_at": "2024-01-19T08:15:00Z"
    }
  ],
  "total": 125,
  "message": "获取测试用例列表成功"
}
```

---

### 2. 获取测试用例详情

#### `GET /api/cases/:id`

获取指定测试用例的详细信息。

**路径参数**
- `id`: 测试用例ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "登录功能测试",
    "description": "测试用户登录功能的正常流程，包括用户名密码验证、token生成等",
    "project_id": 1,
    "module": "auth",
    "priority": "P1",
    "type": "api",
    "tags": "登录,认证,核心功能",
    "enabled": true,
    "script_path": "/tests/auth/login.js",
    "config_json": "{\"timeout\": 5000, \"retries\": 3}",
    "created_by_name": "管理员",
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-19T09:30:00Z"
  }
}
```

**错误响应**
```json
{
  "success": false,
  "message": "测试用例不存在",
  "error": "CASE_NOT_FOUND"
}
```

---

### 3. 创建测试用例

#### `POST /api/cases`

创建新的测试用例。

**请求参数**
```json
{
  "name": "新用例测试",              // 必需，用例名称
  "description": "用例描述",        // 可选，用例描述
  "projectId": 1,                  // 可选，项目ID
  "module": "auth",                // 可选，模块名称
  "priority": "P1",                // 可选，优先级，默认"P1"
  "type": "api",                   // 可选，用例类型，默认"api"
  "tags": "标签1,标签2",           // 可选，标签
  "configJson": {                  // 可选，配置信息(对象或字符串)
    "timeout": 5000,
    "retries": 3
  },
  "createdBy": 1                   // 可选，创建用户ID，默认1
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 126
  },
  "message": "测试用例创建成功"
}
```

**验证错误响应**
```json
{
  "success": false,
  "message": "参数验证失败",
  "details": [
    "name 不能为空",
    "priority 必须是有效值 (P1/P2/P3)"
  ],
  "error": "VALIDATION_ERROR"
}
```

---

### 4. 更新测试用例

#### `PUT /api/cases/:id`

更新指定测试用例的信息。

**路径参数**
- `id`: 测试用例ID

**请求参数** (所有参数都是可选的)
```json
{
  "name": "更新后的用例名称",        // 可选，用例名称
  "description": "更新后的描述",    // 可选，用例描述
  "projectId": 2,                  // 可选，项目ID
  "module": "payment",             // 可选，模块名称
  "priority": "P2",                // 可选，优先级
  "type": "ui",                    // 可选，用例类型
  "enabled": true,                 // 可选，启用状态
  "tags": "支付,核心",             // 可选，标签
  "scriptPath": "/tests/new.js",   // 可选，脚本路径
  "configJson": {                  // 可选，配置信息
    "timeout": 8000
  },
  "updatedBy": 2                   // 可选，更新用户ID，默认1
}
```

**响应示例**
```json
{
  "success": true,
  "message": "测试用例更新成功"
}
```

---

### 5. 删除测试用例

#### `DELETE /api/cases/:id`

删除指定的测试用例。

**路径参数**
- `id`: 测试用例ID

**响应示例**
```json
{
  "success": true,
  "message": "测试用例删除成功"
}
```

**错误响应**
```json
{
  "success": false,
  "message": "无法删除正在执行的测试用例",
  "error": "CASE_IN_USE"
}
```

---

### 6. 触发单个用例执行

#### `POST /api/cases/:id/run`

触发指定测试用例的执行。

**路径参数**
- `id`: 测试用例ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "caseId": 1,
    "caseName": "登录功能测试",
    "status": "pending",
    "buildUrl": "http://jenkins.example.com/job/single-case/125/",
    "queueId": "queue_12345"
  },
  "message": "测试用例执行已启动"
}
```

**错误响应**
```json
{
  "success": false,
  "message": "用例已禁用，无法执行",
  "error": "CASE_DISABLED"
}
```

---

### 7. 单个用例执行回调

#### `POST /api/cases/:id/callback`

Jenkins 单个用例执行完成后的回调接口。

**路径参数**
- `id`: 测试用例ID

**请求参数**
```json
{
  "status": "passed",              // 必需，执行状态 (passed/failed/skipped/error)
  "duration": 1500,               // 必需，执行时长(毫秒)
  "errorMessage": "错误信息"       // 可选，错误信息
}
```

**响应示例**
```json
{
  "success": true,
  "message": "用例执行结果已记录"
}
```

---

### 8. 获取所有模块列表

#### `GET /api/cases/modules/list`

获取所有不重复的模块名称列表。

**响应示例**
```json
{
  "success": true,
  "data": [
    "auth",
    "payment",
    "order",
    "user",
    "product",
    "admin"
  ]
}
```

---

### 9. 获取运行中的用例列表

#### `GET /api/cases/running/list`

获取当前正在执行的测试用例列表 (当前实现返回空数组)。

**响应示例**
```json
{
  "success": true,
  "data": []
}
```

---

## 任务管理 API

任务管理 API 提供测试任务的完整生命周期管理，包括任务创建、编辑、执行历史查询等功能。

### 基础路径
所有任务管理 API 的基础路径为：`/api/tasks`

---

### 1. 获取任务列表

#### `GET /api/tasks`

获取测试任务列表，支持项目和状态筛选。

**查询参数**
```json
{
  "projectId": 1,              // 可选，项目ID筛选
  "status": "active",          // 可选，任务状态筛选
  "limit": 50,                 // 可选，返回记录数，默认50
  "offset": 0                  // 可选，偏移量，默认0
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "登录模块自动化测试",
      "description": "包含登录、注册、密码重置等功能的自动化测试任务",
      "project_id": 1,
      "project_name": "电商平台",
      "case_ids": "1,2,3,4,5",
      "trigger_type": "manual",
      "cron_expression": null,
      "environment_id": 1,
      "environment_name": "测试环境",
      "status": "active",
      "created_by": 1,
      "created_by_name": "管理员",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-19T09:30:00Z"
    },
    {
      "id": 2,
      "name": "每日回归测试",
      "description": "每日定时执行的核心功能回归测试",
      "project_id": 1,
      "project_name": "电商平台",
      "case_ids": "1,2,3,6,7,8,9,10",
      "trigger_type": "schedule",
      "cron_expression": "0 2 * * *",
      "environment_id": 1,
      "environment_name": "测试环境",
      "status": "active",
      "created_by": 1,
      "created_by_name": "管理员",
      "created_at": "2024-01-10T14:30:00Z",
      "updated_at": "2024-01-18T16:45:00Z"
    }
  ]
}
```

---

### 2. 获取任务详情

#### `GET /api/tasks/:id`

获取指定任务的详细信息，包括关联的测试用例和最近的执行记录。

**路径参数**
- `id`: 任务ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "登录模块自动化测试",
    "description": "包含登录、注册、密码重置等功能的自动化测试任务",
    "project_id": 1,
    "case_ids": "1,2,3,4,5",
    "trigger_type": "manual",
    "cron_expression": null,
    "environment_id": 1,
    "created_by": 1,
    "created_by_name": "管理员",
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-19T09:30:00Z",
    "cases": [
      {
        "id": 1,
        "name": "登录功能测试",
        "type": "api",
        "status": "active",
        "priority": "P1"
      },
      {
        "id": 2,
        "name": "注册功能测试",
        "type": "api",
        "status": "active",
        "priority": "P1"
      },
      {
        "id": 3,
        "name": "密码重置测试",
        "type": "api",
        "status": "active",
        "priority": "P2"
      }
    ],
    "recentExecutions": [
      {
        "id": 12345,
        "status": "success",
        "start_time": "2024-01-19T10:00:00Z",
        "end_time": "2024-01-19T10:05:30Z",
        "duration": 330000,
        "passed_cases": 5,
        "failed_cases": 0
      },
      {
        "id": 12340,
        "status": "failed",
        "start_time": "2024-01-18T15:30:00Z",
        "end_time": "2024-01-18T15:33:45Z",
        "duration": 225000,
        "passed_cases": 4,
        "failed_cases": 1
      }
    ]
  }
}
```

**错误响应**
```json
{
  "success": false,
  "message": "任务不存在",
  "error": "TASK_NOT_FOUND"
}
```

---

### 3. 创建任务

#### `POST /api/tasks`

创建新的测试任务。

**请求参数**
```json
{
  "name": "新测试任务",              // 必需，任务名称
  "description": "任务描述",        // 可选，任务描述
  "projectId": 1,                  // 可选，项目ID
  "caseIds": [1, 2, 3, 4],         // 可选，关联的测试用例ID数组
  "triggerType": "manual",         // 可选，触发类型，默认"manual"
  "cronExpression": "0 2 * * *",   // 可选，定时表达式(schedule类型时需要)
  "environmentId": 1,              // 可选，环境ID
  "createdBy": 1                   // 可选，创建用户ID，默认1
}
```

**触发类型说明**
- `manual`: 手动触发
- `schedule`: 定时触发
- `jenkins`: Jenkins触发

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 15
  },
  "message": "任务创建成功"
}
```

**验证错误响应**
```json
{
  "success": false,
  "message": "参数验证失败",
  "details": [
    "name 不能为空",
    "triggerType 必须是有效值 (manual/schedule/jenkins)",
    "定时任务必须提供 cronExpression"
  ],
  "error": "VALIDATION_ERROR"
}
```

---

### 4. 更新任务

#### `PUT /api/tasks/:id`

更新指定任务的信息。

**路径参数**
- `id`: 任务ID

**请求参数** (所有参数都是可选的)
```json
{
  "name": "更新后的任务名称",        // 可选，任务名称
  "description": "更新后的描述",    // 可选，任务描述
  "projectId": 2,                  // 可选，项目ID
  "caseIds": [1, 2, 5, 6],         // 可选，关联的测试用例ID数组
  "triggerType": "schedule",       // 可选，触发类型
  "cronExpression": "0 3 * * *",   // 可选，定时表达式
  "environmentId": 2,              // 可选，环境ID
  "status": "inactive"             // 可选，任务状态
}
```

**响应示例**
```json
{
  "success": true,
  "message": "任务更新成功"
}
```

---

### 5. 删除任务

#### `DELETE /api/tasks/:id`

删除指定的测试任务。

**路径参数**
- `id`: 任务ID

**响应示例**
```json
{
  "success": true,
  "message": "任务删除成功"
}
```

**错误响应**
```json
{
  "success": false,
  "message": "无法删除正在执行的任务",
  "error": "TASK_IN_USE"
}
```

---

### 6. 获取任务执行历史

#### `GET /api/tasks/:id/executions`

获取指定任务的执行历史记录。

**路径参数**
- `id`: 任务ID

**查询参数**
```json
{
  "limit": 20                      // 可选，返回记录数，默认20
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "status": "success",
      "start_time": "2024-01-19T10:00:00Z",
      "end_time": "2024-01-19T10:05:30Z",
      "duration": 330000,
      "passed_cases": 5,
      "failed_cases": 0,
      "executed_by_name": "张三"
    },
    {
      "id": 12340,
      "status": "failed",
      "start_time": "2024-01-18T15:30:00Z",
      "end_time": "2024-01-18T15:33:45Z",
      "duration": 225000,
      "passed_cases": 4,
      "failed_cases": 1,
      "executed_by_name": "李四"
    },
    {
      "id": 12335,
      "status": "success",
      "start_time": "2024-01-17T09:15:00Z",
      "end_time": "2024-01-17T09:18:20Z",
      "duration": 200000,
      "passed_cases": 5,
      "failed_cases": 0,
      "executed_by_name": "系统定时"
    }
  ]
}
```

---

## 仪表盘分析 API

仪表盘分析 API 提供平台的统计数据、趋势分析、性能指标等信息，用于展示测试执行的整体情况。

### 基础路径
所有仪表盘分析 API 的基础路径为：`/api/dashboard`

---

### 1. 获取核心指标

#### `GET /api/dashboard/stats`

获取仪表盘核心指标卡片数据。

**响应示例**
```json
{
  "success": true,
  "data": {
    "totalCases": 1250,              // 总测试用例数
    "todayRuns": 45,                 // 今日执行次数
    "todaySuccessRate": 89.5,        // 今日成功率(百分比)
    "runningTasks": 3                // 运行中的任务数
  }
}
```

---

### 2. 获取今日执行统计

#### `GET /api/dashboard/today-execution`

获取今日执行统计数据，用于饼图展示。

**响应示例**
```json
{
  "success": true,
  "data": {
    "total": 150,                    // 今日总执行用例数
    "passed": 134,                   // 通过用例数
    "failed": 12,                    // 失败用例数
    "skipped": 4                     // 跳过用例数
  }
}
```

---

### 3. 获取趋势数据

#### `GET /api/dashboard/trend?days=30`

获取历史趋势数据，用于趋势图展示。

**查询参数**
```json
{
  "days": 30                       // 可选，统计天数，默认30
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-19",
      "totalExecutions": 45,
      "passedCases": 134,
      "failedCases": 12,
      "skippedCases": 4,
      "successRate": 89.33
    },
    {
      "date": "2024-01-18",
      "totalExecutions": 38,
      "passedCases": 112,
      "failedCases": 8,
      "skippedCases": 2,
      "successRate": 93.33
    },
    {
      "date": "2024-01-17",
      "totalExecutions": 42,
      "passedCases": 125,
      "failedCases": 15,
      "skippedCases": 3,
      "successRate": 87.41
    }
  ]
}
```

---

### 4. 获取对比分析数据

#### `GET /api/dashboard/comparison?days=30`

获取周期对比分析数据。

**查询参数**
```json
{
  "days": 30                       // 可选，对比周期天数，默认30
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "runsComparison": 12.5,          // 执行次数变化百分比(正数为增长)
    "successRateComparison": -2.1,   // 成功率变化百分比
    "failureComparison": 15.8        // 失败率变化百分比
  }
}
```

---

### 5. 获取最近执行记录

#### `GET /api/dashboard/recent-runs?limit=10`

获取最近的测试执行记录。

**查询参数**
```json
{
  "limit": 10                      // 可选，返回记录数，默认10
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "status": "success",
      "totalCases": 25,
      "passedCases": 23,
      "failedCases": 2,
      "skippedCases": 0,
      "startTime": "2024-01-19T10:00:00Z",
      "endTime": "2024-01-19T10:05:30Z",
      "duration": 330000
    },
    {
      "id": 12344,
      "status": "running",
      "totalCases": 15,
      "passedCases": 0,
      "failedCases": 0,
      "skippedCases": 0,
      "startTime": "2024-01-19T09:45:00Z",
      "endTime": null,
      "duration": null
    }
  ]
}
```

---

### 6. 批量获取仪表盘数据

#### `GET /api/dashboard/all?timeRange=30d`

一次性获取仪表盘核心数据（不含最近运行记录），提高前端加载效率。

**说明**：
- 为了优化性能，该接口已移除 `recentRuns` 字段。如需获取最近运行记录，请使用 `/api/dashboard/recent-runs` 接口。
- 趋势数据采用 T-1 数据口径（不展示当天数据）。请求 N 天数据时，实际返回 N 条历史记录（不包含今天）。

**查询参数**
```json
{
  "timeRange": "30d"               // 可选，时间范围，默认"30d"。trendData 返回 N 条历史记录（不含今天）
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalCases": 1250,
      "todayRuns": 45,
      "todaySuccessRate": 89.5,
      "runningTasks": 3
    },
    "todayExecution": {
      "total": 150,
      "passed": 134,
      "failed": 12,
      "skipped": 4
    },
    "trendData": [
      {
        "date": "2024-01-19",
        "totalExecutions": 45,
        "passedCases": 134,
        "failedCases": 12,
        "skippedCases": 4,
        "successRate": 89.33
      }
    ]
  }
}
```

---

### 7. 刷新每日汇总数据

#### `POST /api/dashboard/refresh-summary`

手动刷新每日汇总数据。

**请求参数**
```json
{
  "date": "2024-01-19"             // 可选，指定日期，默认今天
}
```

**响应示例**
```json
{
  "success": true,
  "message": "每日汇总数据已刷新"
}
```

---

## 用户认证 API

用户认证 API 提供用户注册、登录、密码管理和JWT令牌管理等功能。

### 基础路径
所有用户认证 API 的基础路径为：`/api/auth`

---

### 1. 用户注册

#### `POST /api/auth/register`

注册新用户账号。

**请求参数**
```json
{
  "username": "testuser",             // 必需，用户名
  "email": "test@example.com",        // 必需，邮箱
  "password": "password123",          // 必需，密码
  "fullName": "测试用户"              // 可选，全名
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "userId": 123,
    "username": "testuser",
    "email": "test@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "注册成功"
}
```

---

### 2. 用户登录

#### `POST /api/auth/login`

用户登录验证。

**请求参数**
```json
{
  "username": "testuser",             // 必需，用户名或邮箱
  "password": "password123"           // 必需，密码
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "userId": 123,
    "username": "testuser",
    "email": "test@example.com",
    "fullName": "测试用户",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  },
  "message": "登录成功"
}
```

---

### 3. 用户登出

#### `POST /api/auth/logout`

用户登出，使当前token失效。

**认证**: 需要JWT Token

**响应示例**
```json
{
  "success": true,
  "message": "登出成功"
}
```

---

### 4. 忘记密码

#### `POST /api/auth/forgot-password`

请求密码重置。

**请求参数**
```json
{
  "email": "test@example.com"         // 必需，注册邮箱
}
```

**响应示例**
```json
{
  "success": true,
  "message": "密码重置邮件已发送"
}
```

---

### 5. 重置密码

#### `POST /api/auth/reset-password`

使用重置令牌重置密码。

**请求参数**
```json
{
  "token": "reset_token_here",        // 必需，重置令牌
  "newPassword": "newpassword123"     // 必需，新密码
}
```

**响应示例**
```json
{
  "success": true,
  "message": "密码重置成功"
}
```

---

### 6. 获取当前用户信息

#### `GET /api/auth/me`

获取当前登录用户的信息。

**认证**: 需要JWT Token

**响应示例**
```json
{
  "success": true,
  "data": {
    "userId": 123,
    "username": "testuser",
    "email": "test@example.com",
    "fullName": "测试用户",
    "role": "user",
    "createdAt": "2024-01-15T10:00:00Z",
    "lastLoginAt": "2024-01-19T10:30:00Z"
  }
}
```

---

### 7. 刷新JWT令牌

#### `POST /api/auth/refresh`

刷新JWT令牌。

**请求参数**
```json
{
  "refreshToken": "refresh_token_here"  // 必需，刷新令牌
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  },
  "message": "令牌刷新成功"
}
```

---

## 代码库管理 API

代码库管理 API 提供代码库配置、同步操作、分支管理等功能，用于与Git仓库集成。

### 基础路径
所有代码库管理 API 的基础路径为：`/api/repositories`

---

### 1. 获取代码库列表

#### `GET /api/repositories`

获取配置的代码库列表。

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "电商平台测试",
      "url": "https://github.com/company/ecommerce-tests.git",
      "branch": "main",
      "sync_enabled": true,
      "last_sync_at": "2024-01-19T09:30:00Z",
      "last_sync_status": "success",
      "created_at": "2024-01-10T14:00:00Z"
    },
    {
      "id": 2,
      "name": "API测试套件",
      "url": "https://gitlab.com/company/api-tests.git",
      "branch": "develop",
      "sync_enabled": false,
      "last_sync_at": "2024-01-18T16:45:00Z",
      "last_sync_status": "failed",
      "created_at": "2024-01-12T09:15:00Z"
    }
  ]
}
```

---

### 2. 获取代码库详情

#### `GET /api/repositories/:id`

获取指定代码库的详细信息。

**路径参数**
- `id`: 代码库ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "电商平台测试",
    "description": "电商平台的自动化测试用例仓库",
    "url": "https://github.com/company/ecommerce-tests.git",
    "branch": "main",
    "sync_enabled": true,
    "sync_schedule": "0 */6 * * *",
    "test_path": "/tests",
    "config_path": "/config",
    "last_sync_at": "2024-01-19T09:30:00Z",
    "last_sync_status": "success",
    "last_sync_commit": "abc123def456",
    "created_at": "2024-01-10T14:00:00Z",
    "updated_at": "2024-01-19T09:30:00Z"
  }
}
```

---

### 3. 创建代码库配置

#### `POST /api/repositories`

创建新的代码库配置。

**请求参数**
```json
{
  "name": "新测试仓库",                // 必需，仓库名称
  "description": "仓库描述",          // 可选，仓库描述
  "url": "https://github.com/...",   // 必需，仓库URL
  "branch": "main",                  // 可选，分支名，默认"main"
  "syncEnabled": true,               // 可选，是否启用同步，默认true
  "syncSchedule": "0 */6 * * *",     // 可选，同步计划
  "testPath": "/tests",              // 可选，测试路径
  "configPath": "/config"            // 可选，配置路径
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 3
  },
  "message": "代码库配置创建成功"
}
```

---

### 4. 更新代码库配置

#### `PUT /api/repositories/:id`

更新代码库配置信息。

**路径参数**
- `id`: 代码库ID

**请求参数** (所有参数都是可选的)
```json
{
  "name": "更新后的仓库名",
  "description": "更新后的描述",
  "url": "https://github.com/...",
  "branch": "develop",
  "syncEnabled": false,
  "syncSchedule": "0 */12 * * *",
  "testPath": "/automation",
  "configPath": "/settings"
}
```

**响应示例**
```json
{
  "success": true,
  "message": "代码库配置更新成功"
}
```

---

### 5. 删除代码库配置

#### `DELETE /api/repositories/:id`

删除指定的代码库配置。

**路径参数**
- `id`: 代码库ID

**响应示例**
```json
{
  "success": true,
  "message": "代码库配置删除成功"
}
```

---

### 6. 手动触发同步

#### `POST /api/repositories/:id/sync`

手动触发代码库同步。

**路径参数**
- `id`: 代码库ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "syncId": 456,
    "status": "started"
  },
  "message": "同步任务已启动"
}
```

---

### 7. 获取同步日志列表

#### `GET /api/repositories/:id/sync-logs`

获取代码库的同步日志列表。

**路径参数**
- `id`: 代码库ID

**查询参数**
```json
{
  "limit": 20,                       // 可选，返回记录数，默认20
  "offset": 0                        // 可选，偏移量，默认0
}
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": 456,
      "status": "success",
      "start_time": "2024-01-19T09:30:00Z",
      "end_time": "2024-01-19T09:32:15Z",
      "duration": 135000,
      "commit_hash": "abc123def456",
      "cases_added": 3,
      "cases_updated": 5,
      "cases_deleted": 1
    },
    {
      "id": 455,
      "status": "failed",
      "start_time": "2024-01-18T15:30:00Z",
      "end_time": "2024-01-18T15:31:30Z",
      "duration": 90000,
      "error_message": "Git authentication failed",
      "commit_hash": null,
      "cases_added": 0,
      "cases_updated": 0,
      "cases_deleted": 0
    }
  ],
  "total": 25
}
```

---

### 8. 获取同步日志详情

#### `GET /api/repositories/:id/sync-logs/:logId`

获取指定同步日志的详细信息。

**路径参数**
- `id`: 代码库ID
- `logId`: 日志ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": 456,
    "repository_id": 1,
    "status": "success",
    "start_time": "2024-01-19T09:30:00Z",
    "end_time": "2024-01-19T09:32:15Z",
    "duration": 135000,
    "commit_hash": "abc123def456",
    "commit_message": "Add new payment tests",
    "cases_added": 3,
    "cases_updated": 5,
    "cases_deleted": 1,
    "log_details": "Sync completed successfully. Processed 15 test files.",
    "error_message": null
  }
}
```

---

### 9. 测试代码库连接

#### `POST /api/repositories/:id/test-connection`

测试代码库的连接状态。

**路径参数**
- `id`: 代码库ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "latestCommit": "abc123def456",
    "latestCommitMessage": "Add new payment tests",
    "latestCommitDate": "2024-01-19T08:45:00Z",
    "branches": ["main", "develop", "feature/new-tests"]
  },
  "message": "连接测试成功"
}
```

**连接失败响应**
```json
{
  "success": false,
  "data": {
    "connected": false,
    "error": "Authentication failed"
  },
  "message": "连接测试失败"
}
```

---

### 10. 获取分支列表

#### `GET /api/repositories/:id/branches`

获取代码库的分支列表。

**路径参数**
- `id`: 代码库ID

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "name": "main",
      "commit": "abc123def456",
      "lastModified": "2024-01-19T08:45:00Z",
      "isDefault": true
    },
    {
      "name": "develop",
      "commit": "def456ghi789",
      "lastModified": "2024-01-18T16:30:00Z",
      "isDefault": false
    },
    {
      "name": "feature/payment-tests",
      "commit": "ghi789jkl012",
      "lastModified": "2024-01-17T14:20:00Z",
      "isDefault": false
    }
  ]
}
```

---

## 健康检查 API

### `GET /api/health`

检查服务器健康状态。

**响应示例**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2024-01-19T10:00:00Z",
    "uptime": 86400,
    "version": "1.0.0"
  }
}
```

---

## 数据模型与类型定义

### 核心数据类型

#### 执行状态枚举
```typescript
type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'aborted' | 'cancelled';
```

#### 测试用例状态枚举
```typescript
type CaseStatus = 'passed' | 'failed' | 'skipped' | 'error';
```

#### 优先级枚举
```typescript
type Priority = 'P1' | 'P2' | 'P3';
```

#### 触发类型枚举
```typescript
type TriggerType = 'manual' | 'schedule' | 'jenkins';
```

---

### 测试结果对象

#### Auto_TestRunResultsInput
```typescript
interface TestResult {
  caseId: number;                    // 用例ID
  caseName: string;                  // 用例名称
  status: CaseStatus;                // 执行状态
  duration: number;                  // 执行时长(毫秒)
  errorMessage?: string;             // 错误信息
  stackTrace?: string;               // 堆栈跟踪
  screenshotPath?: string;           // 截图路径
  logPath?: string;                  // 日志路径
  assertionsTotal?: number;          // 总断言数
  assertionsPassed?: number;         // 通过断言数
  responseData?: string;             // 响应数据
}
```

---

### 验证规则汇总

#### Jenkins 回调验证
- `runId`: 必需，正整数，≥1
- `status`: 必需，枚举值 ['success', 'failed', 'aborted']
- `passedCases`, `failedCases`, `skippedCases`: 可选，非负整数
- `durationMs`: 可选，0-86400000毫秒
- `results`: 可选，结果数组，长度必须等于各状态用例数之和

#### 批量执行验证
- `caseIds`: 必需，非空数组，最多100个元素，不能重复
- `projectId`: 必需，正整数，≥1
- `triggeredBy`: 可选，正整数，≥1

#### 单个执行验证
- `caseId`: 必需，正整数，≥1
- `projectId`: 必需，正整数，≥1
- `triggeredBy`: 可选，正整数，≥1

---

## 集成指南

### Jenkins 集成配置

#### 1. 环境变量配置
```bash
# Jenkins 基础配置
JENKINS_URL=http://jenkins.example.com
JENKINS_USER=automation
JENKINS_TOKEN=your_jenkins_token

# 回调认证配置（三选一）
JENKINS_API_KEY=your_api_key
JENKINS_JWT_SECRET=your_jwt_secret
JENKINS_SIGNATURE_SECRET=your_signature_secret

# 可选配置
JENKINS_ALLOWED_IPS=192.168.1.100,10.0.0.50
```

#### 2. Jenkins Pipeline 示例
```groovy
pipeline {
    agent any

    stages {
        stage('Trigger Test') {
            steps {
                script {
                    // 触发测试执行
                    def response = httpRequest(
                        url: "${PLATFORM_URL}/api/jenkins/run-batch",
                        httpMode: 'POST',
                        requestBody: """
                        {
                            "caseIds": [1, 2, 3],
                            "projectId": 1,
                            "triggeredBy": 1
                        }
                        """,
                        customHeaders: [[name: 'X-Api-Key', value: env.JENKINS_API_KEY]]
                    )

                    def result = readJSON text: response.content
                    env.RUN_ID = result.data.runId
                }
            }
        }

        stage('Execute Tests') {
            steps {
                // 执行测试逻辑
                sh 'npm test'
            }
        }

        stage('Report Results') {
            steps {
                script {
                    // 上报测试结果
                    def results = [
                        [caseId: 1, caseName: "Login Test", status: "passed", duration: 1500],
                        [caseId: 2, caseName: "Register Test", status: "failed", duration: 800]
                    ]

                    httpRequest(
                        url: "${PLATFORM_URL}/api/jenkins/callback",
                        httpMode: 'POST',
                        requestBody: """
                        {
                            "runId": ${env.RUN_ID},
                            "status": "success",
                            "passedCases": 1,
                            "failedCases": 1,
                            "durationMs": 2300,
                            "results": ${writeJSON returnText: true, json: results}
                        }
                        """,
                        customHeaders: [[name: 'X-Api-Key', value: env.JENKINS_API_KEY]]
                    )
                }
            }
        }
    }
}
```

#### 3. 认证方式选择

**API Key 认证（推荐）**
```bash
curl -X POST "${PLATFORM_URL}/api/jenkins/callback" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your_api_key" \
  -d '{"runId": 12345, "status": "success"}'
```

**JWT 认证**
```bash
curl -X POST "${PLATFORM_URL}/api/jenkins/callback" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{"runId": 12345, "status": "success"}'
```

**签名认证**
```bash
# 计算签名
timestamp=$(date +%s)
signature=$(echo -n "${timestamp}${request_body}" | openssl dgst -sha256 -hmac "your_secret" -binary | base64)

curl -X POST "${PLATFORM_URL}/api/jenkins/callback" \
  -H "Content-Type: application/json" \
  -H "X-Jenkins-Signature: ${signature}" \
  -H "X-Jenkins-Timestamp: ${timestamp}" \
  -d '{"runId": 12345, "status": "success"}'
```

---

### 前端集成示例

#### React Hook 示例
```typescript
import { useState, useEffect } from 'react';

interface DashboardData {
  stats: {
    totalCases: number;
    todayRuns: number;
    todaySuccessRate: number;
    runningTasks: number;
  };
  recentRuns: Array<{
    id: number;
    status: string;
    totalCases: number;
    startTime: string;
  }>;
}

export const useDashboard = (timeRange = '30d') => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch(`/api/dashboard/all?timeRange=${timeRange}`);
        const result = await response.json();

        if (result.success) {
          setData(result.data);
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError('获取仪表盘数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [timeRange]);

  return { data, loading, error };
};
```

---

## 故障排除

### 常见问题

#### 1. Jenkins 回调认证失败
**问题**: 收到 401 认证失败错误

**解决方案**:
1. 检查环境变量配置
2. 使用诊断接口测试连接
3. 验证认证头格式

```bash
# 测试连接
curl -X POST "${PLATFORM_URL}/api/jenkins/callback/diagnose" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your_api_key"
```

#### 2. 执行卡住不更新
**问题**: 执行状态长时间停留在 "running"

**解决方案**:
1. 查看卡住的执行列表
2. 手动同步执行状态
3. 使用修复工具

```bash
# 查看卡住的执行
curl "${PLATFORM_URL}/api/executions/stuck?timeout=10"

# 手动同步
curl -X POST "${PLATFORM_URL}/api/executions/12345/sync"

# 批量修复
curl -X POST "${PLATFORM_URL}/api/jenkins/monitoring/fix-stuck" \
  -H "Content-Type: application/json" \
  -d '{"timeoutMinutes": 5, "dryRun": false}'
```

#### 3. 限流错误
**问题**: 收到 429 请求频率过高错误

**解决方案**:
1. 降低请求频率
2. 实现指数退避重试
3. 批量处理请求

#### 4. 数据验证失败
**问题**: 400 参数验证失败

**解决方案**:
1. 检查请求参数格式
2. 验证必需字段
3. 确认数据类型和范围

---

### 性能优化建议

#### 1. 批量操作
- 使用 `/api/dashboard/all` 获取所有仪表盘数据
- 批量触发用例执行而不是单个触发
- 合并多个查询请求

#### 2. 缓存策略
- 仪表盘数据可缓存 5-10 分钟
- 用例列表数据可缓存较长时间
- 使用条件请求（ETag/Last-Modified）

#### 3. 分页查询
- 大列表使用 limit/offset 分页
- 合理设置每页大小（建议 20-50）
- 实现无限滚动或分页导航

---

## 总结

本文档详细描述了自动化测试平台的完整 API 接口，包含：

- **16个 Jenkins 集成接口** - 核心执行引擎集成
- **10个执行管理接口** - 执行生命周期管理
- **8个测试用例管理接口** - 用例资产管理
- **6个任务管理接口** - 任务编排和调度
- **7个仪表盘分析接口** - 数据统计和可视化
- **7个用户认证接口** - 身份认证和授权
- **10个代码库管理接口** - Git 仓库集成
- **1个健康检查接口** - 系统状态监控

所有接口均包含详细的请求/响应示例、参数验证规则、错误处理说明和集成指南，为开发者提供完整的接口参考文档。

---