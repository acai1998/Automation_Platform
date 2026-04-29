# AI 工作台相关现有表汇总

## 一、说明

本文档用于将 `docs/Table` 路径下与 **AI 工作台数据存储方案** 直接相关的现有表，合并成一份可集中查看的说明文档。

用途：

- 方便对照 [数据存储_Auto_AiCase命名版.md](</d:/AllProject/Automation_Platform/docs/AI 智能用例生成/数据存储/数据存储_Auto_AiCase命名版.md>)
- 快速确认哪些表是“继续复用”，哪些是“新增设计”
- 查看现有外键依赖，避免新表设计与现网表结构冲突

说明：

- 本文档内容来源于 `docs/Table` 下现有单表文件
- 本次仅做汇总，不修改原始表定义
- 若单表文件与代码实体、真实数据库存在偏差，应以最终数据库为准

---

## 二、汇总范围

本次合并的现有表如下：

### 2.1 AI 工作台直接相关

```text
Auto_AiCaseWorkspaces
Auto_AiCaseNodeExecutions
Auto_AiCaseNodeAttachments
```

### 2.2 自动化侧相邻表（当前不直接复用）

```text
Auto_TestCase
Auto_TestRun
Auto_TestRunResults
Auto_TaskAuditLogs
```

### 2.3 外键依赖与基础表

```text
Auto_TestCaseProjects
Auto_TestEnvironments
Auto_TestCaseTasks
Auto_TestCaseTaskExecutions
Auto_Users
```

---

## 三、表分组说明

| 分组 | 表名 | 作用 |
| --- | --- | --- |
| 工作台主数据 | `Auto_AiCaseWorkspaces` | AI 工作台主表 |
| 工作台兼容能力 | `Auto_AiCaseNodeExecutions` | 节点状态流水 |
| 工作台兼容能力 | `Auto_AiCaseNodeAttachments` | 节点截图与证据 |
| 自动化脚本资产 | `Auto_TestCase` | 自动化测试脚本资产表，不是 AI 生成用例表 |
| 自动化执行链路 | `Auto_TestRun` | 自动化执行批次表 |
| 自动化执行链路 | `Auto_TestRunResults` | 自动化执行结果明细表 |
| 自动化任务审计 | `Auto_TaskAuditLogs` | 自动化任务操作审计 |
| 基础主数据 | `Auto_TestCaseProjects` | 项目表 |
| 基础主数据 | `Auto_TestEnvironments` | 环境表 |
| 基础主数据 | `Auto_TestCaseTasks` | 测试任务表 |
| 基础主数据 | `Auto_TestCaseTaskExecutions` | 测试任务运行记录表 |
| 基础主数据 | `Auto_Users` | 用户表 |

---

## 四、现有表结构

### 4.1 `Auto_AiCaseWorkspaces`

来源：`docs/Table/Auto_AiCaseWorkspaces`

```sql
-- autotest.Auto_AiCaseWorkspaces definition

CREATE TABLE `Auto_AiCaseWorkspaces` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '工作台ID',
  `workspace_key` varchar(64) NOT NULL COMMENT '工作台稳定唯一键(UUID)',
  `name` varchar(255) NOT NULL COMMENT '工作台名称',
  `project_id` int(11) DEFAULT NULL COMMENT '关联项目ID',
  `requirement_text` longtext DEFAULT NULL COMMENT '需求描述/PRD文本',
  `map_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'MindElixir脑图JSON快照' CHECK (json_valid(`map_data`)),
  `status` enum('draft','published','archived') DEFAULT 'draft' COMMENT '工作台状态',
  `sync_source` enum('local_import','remote_direct','mixed') DEFAULT 'remote_direct' COMMENT '同步来源',
  `version` int(11) NOT NULL DEFAULT 1 COMMENT '版本号',
  `total_cases` int(11) NOT NULL DEFAULT 0 COMMENT '测试节点总数',
  `todo_cases` int(11) NOT NULL DEFAULT 0 COMMENT '待执行节点数',
  `doing_cases` int(11) NOT NULL DEFAULT 0 COMMENT '执行中节点数',
  `blocked_cases` int(11) NOT NULL DEFAULT 0 COMMENT '阻塞节点数',
  `passed_cases` int(11) NOT NULL DEFAULT 0 COMMENT '通过节点数',
  `failed_cases` int(11) NOT NULL DEFAULT 0 COMMENT '失败节点数',
  `skipped_cases` int(11) NOT NULL DEFAULT 0 COMMENT '跳过节点数',
  `last_synced_at` datetime DEFAULT NULL COMMENT '最近同步时间',
  `created_by` int(11) DEFAULT NULL COMMENT '创建人ID',
  `updated_by` int(11) DEFAULT NULL COMMENT '更新人ID',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ai_workspace_key` (`workspace_key`),
  KEY `idx_ai_workspace_project` (`project_id`),
  KEY `idx_ai_workspace_status` (`status`),
  KEY `idx_ai_workspace_updated_at` (`updated_at`),
  KEY `idx_ai_workspace_created_by` (`created_by`),
  KEY `idx_ai_workspace_updated_by` (`updated_by`),
  CONSTRAINT `fk_ai_workspace_project` FOREIGN KEY (`project_id`) REFERENCES `Auto_TestCaseProjects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_workspace_created_by` FOREIGN KEY (`created_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_workspace_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 用例工作台主表';
```

### 4.2 `Auto_AiCaseNodeExecutions`

来源：`docs/Table/Auto_AiCaseNodeExecutions`

```sql
-- autotest.Auto_AiCaseNodeExecutions definition

CREATE TABLE `Auto_AiCaseNodeExecutions` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '节点执行记录ID',
  `workspace_id` int(11) NOT NULL COMMENT '关联工作台ID',
  `workspace_version` int(11) NOT NULL DEFAULT 1 COMMENT '记录时工作台版本',
  `node_id` varchar(64) NOT NULL COMMENT '脑图节点ID',
  `node_topic` varchar(255) NOT NULL COMMENT '节点标题快照',
  `node_path` varchar(1000) DEFAULT NULL COMMENT '节点路径快照',
  `previous_status` enum('todo','doing','blocked','passed','failed','skipped') DEFAULT NULL COMMENT '变更前状态',
  `current_status` enum('todo','doing','blocked','passed','failed','skipped') NOT NULL DEFAULT 'todo' COMMENT '变更后状态',
  `operator_id` int(11) DEFAULT NULL COMMENT '操作人ID',
  `comment` text DEFAULT NULL COMMENT '执行备注',
  `meta_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '扩展信息JSON' CHECK (`meta_json` IS NULL OR json_valid(`meta_json`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp() COMMENT '记录时间',
  PRIMARY KEY (`id`),
  KEY `idx_ai_node_exec_workspace` (`workspace_id`),
  KEY `idx_ai_node_exec_node` (`workspace_id`,`node_id`,`created_at`),
  KEY `idx_ai_node_exec_status` (`current_status`),
  KEY `idx_ai_node_exec_operator` (`operator_id`),
  CONSTRAINT `fk_ai_node_exec_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `Auto_AiCaseWorkspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_node_exec_operator` FOREIGN KEY (`operator_id`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 用例节点状态变更流水表';
```

### 4.3 `Auto_AiCaseNodeAttachments`

来源：`docs/Table/Auto_AiCaseNodeAttachments`

```sql
-- autotest.Auto_AiCaseNodeAttachments definition

CREATE TABLE `Auto_AiCaseNodeAttachments` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '附件ID',
  `workspace_id` int(11) NOT NULL COMMENT '关联工作台ID',
  `node_id` varchar(64) NOT NULL COMMENT '脑图节点ID',
  `execution_log_id` int(11) DEFAULT NULL COMMENT '关联节点执行流水ID',
  `file_name` varchar(255) NOT NULL COMMENT '原始文件名',
  `mime_type` varchar(120) DEFAULT NULL COMMENT '文件MIME类型',
  `file_size` int(11) NOT NULL DEFAULT 0 COMMENT '文件大小(bytes)',
  `storage_provider` enum('local','oss','s3','cos','minio') NOT NULL DEFAULT 'oss' COMMENT '对象存储提供方',
  `storage_bucket` varchar(120) DEFAULT NULL COMMENT '对象存储bucket',
  `storage_key` varchar(500) NOT NULL COMMENT '对象存储key',
  `access_url` varchar(1000) DEFAULT NULL COMMENT '可访问URL',
  `checksum_sha256` varchar(64) DEFAULT NULL COMMENT '文件SHA256',
  `uploaded_by` int(11) DEFAULT NULL COMMENT '上传人ID',
  `created_at` datetime NOT NULL DEFAULT current_timestamp() COMMENT '上传时间',
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_ai_attachment_workspace` (`workspace_id`),
  KEY `idx_ai_attachment_node` (`workspace_id`,`node_id`),
  KEY `idx_ai_attachment_exec_log` (`execution_log_id`),
  KEY `idx_ai_attachment_uploader` (`uploaded_by`),
  KEY `idx_ai_attachment_storage` (`storage_provider`,`storage_bucket`),
  CONSTRAINT `fk_ai_attachment_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `Auto_AiCaseWorkspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_attachment_exec_log` FOREIGN KEY (`execution_log_id`) REFERENCES `Auto_AiCaseNodeExecutions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_attachment_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 用例节点截图与证据表';
```

### 4.4 `Auto_TestCaseProjects`

来源：`docs/Table/Auto_TestCaseProjects`

```sql
-- autotest.Auto_TestCaseProjects definition

CREATE TABLE `Auto_TestCaseProjects` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '项目唯一标识',
  `name` varchar(100) NOT NULL COMMENT '项目名称',
  `description` text DEFAULT NULL COMMENT '项目描述',
  `status` enum('active','archived') DEFAULT 'active' COMMENT '项目状态',
  `owner_id` int(11) DEFAULT NULL COMMENT '项目负责人ID',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_projects_status` (`status`),
  KEY `idx_projects_owner` (`owner_id`),
  CONSTRAINT `Auto_TestCaseProjects_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例项目表';
```

### 4.5 `Auto_TestEnvironments`

来源：`docs/Table/Auto_TestEnvironments`

```sql
-- autotest.Auto_TestEnvironments definition

CREATE TABLE `Auto_TestEnvironments` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '环境唯一标识',
  `name` varchar(100) NOT NULL COMMENT '环境名称',
  `description` text DEFAULT NULL COMMENT '环境描述',
  `base_url` varchar(255) DEFAULT NULL COMMENT '环境基础URL地址',
  `config_json` text DEFAULT NULL COMMENT '环境配置JSON',
  `status` enum('active','inactive') DEFAULT 'active' COMMENT '环境状态',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_env_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试环境配置表';
```

### 4.6 `Auto_TestCase`

来源：`docs/Table/Auto_TestCase`

说明：

- 这是自动化测试脚本资产表
- 它存的是脚本、仓库、同步 commit、脚本路径等自动化资产信息
- 当前不应作为 `Auto_AiCaseGeneratedCases` 的落表目标
- 如果未来需要把 AI 设计结果与自动化脚本建立关系，建议新增映射表，而不是直接复用这张表

```sql
-- autotest.Auto_TestCase definition

CREATE TABLE `Auto_TestCase` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '用例唯一标识',
  `case_key` varchar(200) DEFAULT NULL COMMENT '用例唯一Key（函数名 / case_id）',
  `name` varchar(200) NOT NULL COMMENT '用例展示名称',
  `description` text DEFAULT NULL COMMENT '用例描述',
  `project_id` int(11) DEFAULT NULL COMMENT '所属项目ID',
  `repo_id` int(11) NOT NULL COMMENT '所属仓库ID',
  `module` varchar(100) DEFAULT NULL COMMENT '功能模块名称',
  `priority` enum('P0','P1','P2','P3') DEFAULT 'P1' COMMENT '优先级',
  `type` enum('api','ui','performance','security') DEFAULT 'api' COMMENT '用例类型',
  `tags` json DEFAULT NULL COMMENT '标签（JSON数组）',
  `owner` varchar(100) DEFAULT NULL COMMENT '用例负责人',
  `source` enum('git','manual') DEFAULT 'git' COMMENT '来源',
  `enabled` tinyint(1) DEFAULT 1 COMMENT '是否有效（Git 中删除则 false）',
  `last_sync_commit` varchar(100) DEFAULT NULL COMMENT '最近同步 commit',
  `script_path` varchar(500) DEFAULT NULL COMMENT '测试脚本文件路径',
  `config_json` text DEFAULT NULL COMMENT '用例配置JSON',
  `created_by` int(11) DEFAULT NULL COMMENT '创建人ID',
  `updated_by` int(11) DEFAULT NULL COMMENT '最后修改人ID',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_case_key` (`case_key`),
  UNIQUE KEY `uniq_repo_case` (`repo_id`,`script_path`(255)),
  KEY `idx_cases_project` (`project_id`),
  KEY `idx_cases_module` (`module`),
  KEY `idx_type` (`type`),
  KEY `idx_priority` (`priority`),
  KEY `idx_enabled` (`enabled`),
  KEY `fk_case_created_by` (`created_by`),
  KEY `fk_case_updated_by` (`updated_by`),
  CONSTRAINT `fk_case_created_by` FOREIGN KEY (`created_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_case_project` FOREIGN KEY (`project_id`) REFERENCES `Auto_TestCaseProjects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_case_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2316 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例资产表';
```

### 4.7 `Auto_TestCaseTasks`

来源：`docs/Table/Auto_TestCaseTasks`

```sql
-- autotest.Auto_TestCaseTasks definition

CREATE TABLE `Auto_TestCaseTasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '任务唯一标识',
  `name` varchar(200) NOT NULL COMMENT '任务名称',
  `description` text DEFAULT NULL COMMENT '任务描述',
  `project_id` int(11) DEFAULT NULL COMMENT '所属项目ID',
  `case_ids` text DEFAULT NULL COMMENT '关联的用例ID列表JSON',
  `trigger_type` enum('manual','scheduled','ci_triggered') DEFAULT 'manual' COMMENT '触发方式',
  `cron_expression` varchar(50) DEFAULT NULL COMMENT 'Cron表达式',
  `max_retries` tinyint(3) NOT NULL DEFAULT 1 COMMENT '失败最大重试次数',
  `retry_delay_ms` int(11) NOT NULL DEFAULT 30000 COMMENT '重试延迟毫秒',
  `environment_id` int(11) DEFAULT NULL COMMENT '执行环境ID',
  `status` enum('active','paused','archived') DEFAULT 'active' COMMENT '任务状态',
  `created_by` int(11) DEFAULT NULL COMMENT '创建人ID',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tasks_project` (`project_id`),
  KEY `idx_tasks_status` (`status`),
  KEY `idx_tasks_trigger` (`trigger_type`),
  KEY `idx_task_trigger_status` (`trigger_type`,`status`),
  KEY `idx_task_updated` (`updated_at`),
  KEY `environment_id` (`environment_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `Auto_TestCaseTasks_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `Auto_TestCaseProjects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `Auto_TestCaseTasks_ibfk_2` FOREIGN KEY (`environment_id`) REFERENCES `Auto_TestEnvironments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `Auto_TestCaseTasks_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试任务表';
```

### 4.8 `Auto_TestCaseTaskExecutions`

来源：`docs/Table/Auto_TestCaseTaskExecutions`

```sql
-- autotest.Auto_TestCaseTaskExecutions definition

CREATE TABLE `Auto_TestCaseTaskExecutions` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '运行记录唯一标识',
  `task_id` int(11) DEFAULT NULL COMMENT '关联的任务ID',
  `task_name` varchar(200) DEFAULT NULL COMMENT '任务名称快照',
  `trigger_type` enum('manual','scheduled','ci_triggered') DEFAULT NULL COMMENT '本次执行的触发方式',
  `status` enum('pending','running','success','failed','cancelled') DEFAULT 'pending' COMMENT '执行状态',
  `total_cases` int(11) DEFAULT 0 COMMENT '本次执行的用例总数',
  `passed_cases` int(11) DEFAULT 0 COMMENT '通过的用例数',
  `failed_cases` int(11) DEFAULT 0 COMMENT '失败的用例数',
  `skipped_cases` int(11) DEFAULT 0 COMMENT '跳过的用例数',
  `start_time` datetime DEFAULT NULL COMMENT '执行开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '执行结束时间',
  `duration` int(11) DEFAULT NULL COMMENT '执行耗时（秒）',
  `executed_by` int(11) DEFAULT NULL COMMENT '执行人ID',
  `environment_id` int(11) DEFAULT NULL COMMENT '执行环境ID',
  `error_message` text DEFAULT NULL COMMENT '错误信息',
  `jenkins_build_id` varchar(100) DEFAULT NULL COMMENT 'Jenkins构建ID',
  `jenkins_build_url` varchar(500) DEFAULT NULL COMMENT 'Jenkins构建URL',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '记录创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_exec_task` (`task_id`),
  KEY `idx_exec_status` (`status`),
  KEY `idx_exec_start_time` (`start_time`),
  KEY `idx_exec_task_start` (`task_id`,`start_time`),
  KEY `idx_exec_task_status` (`task_id`,`status`),
  KEY `idx_exec_task_created` (`task_id`,`created_at`),
  KEY `executed_by` (`executed_by`),
  KEY `environment_id` (`environment_id`),
  CONSTRAINT `Auto_TestCaseTaskExecutions_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `Auto_TestCaseTasks` (`id`) ON DELETE SET NULL,
  CONSTRAINT `Auto_TestCaseTaskExecutions_ibfk_2` FOREIGN KEY (`executed_by`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `Auto_TestCaseTaskExecutions_ibfk_3` FOREIGN KEY (`environment_id`) REFERENCES `Auto_TestEnvironments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=60 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试任务运行记录表';
```

### 4.9 `Auto_TestRun`

来源：`docs/Table/Auto_TestRun`

```sql
-- autotest.Auto_TestRun definition

CREATE TABLE `Auto_TestRun` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '运行ID',
  `project_id` int(11) NOT NULL COMMENT '项目ID',
  `trigger_type` enum('manual','jenkins','schedule') NOT NULL COMMENT '触发方式',
  `execution_id` int(11) DEFAULT NULL COMMENT '关联的 Auto_TestCaseTaskExecutions.id',
  `trigger_by` int(11) DEFAULT NULL COMMENT '触发人',
  `jenkins_job` varchar(255) DEFAULT NULL COMMENT 'Jenkins Job 名称',
  `jenkins_build_id` varchar(100) DEFAULT NULL COMMENT 'Jenkins Build ID',
  `jenkins_url` varchar(500) DEFAULT NULL COMMENT 'Jenkins 构建地址',
  `status` enum('pending','running','success','failed','aborted') DEFAULT 'pending',
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `duration_ms` int(11) DEFAULT NULL,
  `run_config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '运行参数（环境 / 变量等）' CHECK (json_valid(`run_config`)),
  `total_cases` int(11) DEFAULT 0,
  `passed_cases` int(11) DEFAULT 0,
  `failed_cases` int(11) DEFAULT 0,
  `skipped_cases` int(11) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_project` (`project_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='测试执行批次表';
```

### 4.10 `Auto_TestRunResults`

来源：`docs/Table/Auto_TestRunResults`

```sql
-- autotest.Auto_TestRunResults definition

CREATE TABLE `Auto_TestRunResults` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '结果记录唯一标识',
  `execution_id` int(11) NOT NULL COMMENT '关联的运行记录ID',
  `case_id` int(11) DEFAULT NULL COMMENT '关联的用例ID',
  `case_name` varchar(200) DEFAULT NULL COMMENT '用例名称快照',
  `status` enum('passed','failed','skipped','error') DEFAULT NULL COMMENT '执行结果',
  `start_time` datetime DEFAULT NULL COMMENT '用例开始执行时间',
  `end_time` datetime DEFAULT NULL COMMENT '用例执行结束时间',
  `duration` int(11) DEFAULT NULL COMMENT '执行耗时（毫秒）',
  `error_message` text DEFAULT NULL COMMENT '错误信息',
  `error_stack` text DEFAULT NULL COMMENT '错误堆栈信息',
  `screenshot_path` varchar(500) DEFAULT NULL COMMENT '失败截图路径',
  `log_path` varchar(500) DEFAULT NULL COMMENT '执行日志路径',
  `assertions_total` int(11) DEFAULT 0 COMMENT '断言总数',
  `assertions_passed` int(11) DEFAULT 0 COMMENT '断言通过数',
  `response_data` text DEFAULT NULL COMMENT '响应数据JSON',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '记录创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_result_execution` (`execution_id`),
  KEY `idx_result_case` (`case_id`),
  KEY `idx_result_status` (`status`),
  KEY `idx_result_status_exec` (`status`,`execution_id`),
  CONSTRAINT `Auto_TestRunResults_ibfk_1` FOREIGN KEY (`execution_id`) REFERENCES `Auto_TestCaseTaskExecutions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `Auto_TestRunResults_ibfk_2` FOREIGN KEY (`case_id`) REFERENCES `Auto_TestCase` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='测试用例执行结果表';
```

### 4.11 `Auto_TaskAuditLogs`

来源：`docs/Table/Auto_TaskAuditLogs`

```sql
-- autotest.Auto_TaskAuditLogs definition

CREATE TABLE `Auto_TaskAuditLogs` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `task_id` int(11) NOT NULL COMMENT '关联任务ID',
  `action` varchar(100) NOT NULL COMMENT '操作类型（created/updated/deleted/status_changed/manually_triggered/execution_cancelled/compensated/triggered/retry_scheduled/permanently_failed）',
  `operator_id` int(11) DEFAULT NULL COMMENT '操作人ID（NULL=系统自动）',
  `metadata` text DEFAULT NULL COMMENT '操作元数据（JSON）',
  `created_at` datetime NOT NULL DEFAULT current_timestamp() COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_audit_task` (`task_id`),
  KEY `idx_audit_operator` (`operator_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_task_created` (`task_id`,`created_at` DESC),
  CONSTRAINT `fk_audit_task` FOREIGN KEY (`task_id`) REFERENCES `Auto_TestCaseTasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_audit_operator` FOREIGN KEY (`operator_id`) REFERENCES `Auto_Users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务操作审计日志表';
```

### 4.12 `Auto_Users`

来源：`docs/Table/Auto_Users`

```sql
-- autotest.Auto_Users definition

CREATE TABLE `Auto_Users` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '用户唯一标识',
  `username` varchar(100) NOT NULL UNIQUE COMMENT '用户名',
  `email` varchar(255) DEFAULT NULL UNIQUE COMMENT '邮箱地址',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希值',
  `display_name` varchar(100) DEFAULT NULL COMMENT '显示名称',
  `status` enum('active','inactive','locked') DEFAULT 'active' COMMENT '用户状态',
  `role` varchar(50) DEFAULT 'user' COMMENT '用户角色',
  `avatar` varchar(255) DEFAULT NULL COMMENT '头像URL',
  `login_attempts` int(11) DEFAULT 0 COMMENT '登录失败次数',
  `locked_until` datetime DEFAULT NULL COMMENT '账号锁定截止时间',
  `last_login_at` datetime DEFAULT NULL COMMENT '最后登录时间',
  `reset_token` varchar(255) DEFAULT NULL COMMENT '密码重置令牌',
  `reset_token_expires` datetime DEFAULT NULL COMMENT '密码重置令牌过期时间',
  `remember_token` varchar(255) DEFAULT NULL COMMENT '记住登录令牌',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '创建时间',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_username` (`username`),
  UNIQUE KEY `uniq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
```

---

## 五、建议如何配合新方案使用

这份汇总文档建议与下面两份文档配合看：

- [数据存储_Auto_AiCase命名版.md](</d:/AllProject/Automation_Platform/docs/AI 智能用例生成/数据存储/数据存储_Auto_AiCase命名版.md>)
- [AI工作台列表版UI草图.md](</d:/AllProject/Automation_Platform/docs/AI 智能用例生成/AI工作台列表版UI草图.md>)

阅读顺序建议：

1. 先看 `数据存储_Auto_AiCase命名版.md`，明确哪些表是新增设计
2. 再看本文档，确认哪些表是真正可复用，哪些只是自动化侧相邻表
3. 最后结合 UI 草图，对齐首页、列表页、详情页、执行页分别依赖哪些表

---

## 六、结论

现在 AI 工作台相关的现有表已经集中到一份文档里，后续做数据库方案、接口设计或 migration 时，不需要再逐个打开 `docs/Table` 下的单表文件。

如果需要，我下一步可以继续做两件事中的任意一个：

1. 继续把这份“现有表汇总”和“新增表方案”合成一份完整数据库设计总文档
2. 根据这两份文档直接产出一版 MySQL migration SQL
