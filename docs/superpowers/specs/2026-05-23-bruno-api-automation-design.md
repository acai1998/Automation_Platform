# Bruno API Automation Native Integration Design

## Status
Accepted for implementation planning.

## Date
2026-05-23

## Context
The current Automation Platform is a React + Express + TypeScript test management platform. It already has API case pages, task scheduling, execution history, WebSocket progress, result tables, and Jenkins integration. API automation should become a native platform capability without making Jenkins the mandatory execution path.

Bruno is an active open-source, offline-first API client. Its strongest fit is not as a server-side management platform, but as a Git-native API collection format and CLI runner:

- Collections and requests are stored as files, suitable for GitLab repositories.
- The desktop app remains useful for local API editing and debugging.
- The CLI can execute collections/folders/requests with environments, tags, variables, and reporters.
- Reports can be generated as JSON, JUnit XML, and HTML.

The platform should migrate Bruno's core automation surfaces into its own product experience by using Bruno as the execution standard, while the platform owns scheduling, triggering, permissions, execution history, and result aggregation.

## Decision
Build a native API automation module around Bruno collections and `bru run`.

The platform will:

- Synchronize Bruno collections from GitLab repositories.
- Parse collection metadata into platform-visible API cases.
- Create tasks against Bruno collections, folders, requests, or tags.
- Execute Bruno through a backend runner service instead of Jenkins for API automation tasks.
- Parse Bruno JSON/JUnit reports into the existing execution result model.
- Store HTML report artifacts and expose them from execution detail pages.
- Later accept GitLab webhook events to trigger selected API automation tasks.

Jenkins remains available for existing UI/performance or legacy task flows, but API automation tasks should use an explicit `bruno` execution engine.

## Goals
- Provide Postman/Apifox-like API automation usage from inside the existing platform.
- Keep Bruno collections versioned in GitLab and editable through Bruno desktop.
- Reuse existing task scheduling, queueing, retry, timeout, execution, and reporting infrastructure.
- Support manual execution, scheduled execution, and future GitLab-triggered execution.
- Normalize Bruno reports into `Auto_TestRun`, `Auto_TestRunResults`, and task execution summaries.
- Keep secrets out of collection files and execution logs.

## Non-Goals
- Rebuild the full Bruno desktop request editor in the first release.
- Replace all Jenkins-based execution flows.
- Store raw request/response bodies unfiltered by default.
- Implement a complete GitLab CI product inside the platform.
- Let users execute arbitrary shell commands through task configuration.

## Current Project Fit
Existing platform pieces to reuse:

- `src/pages/cases/APICases.tsx` and `BaseCaseList` provide an API case entry point.
- `Auto_TestCase` already supports `type`, `source`, `script_path`, `tags`, and `config_json`.
- `Auto_TestCaseTasks` already supports trigger type, cron expression, environment, retries, and case IDs.
- `TaskSchedulerService` already handles cron loading, queueing, duplicate scheduled window handling, retries, and slot release.
- `Auto_TestCaseTaskExecutions`, `Auto_TestRun`, and `Auto_TestRunResults` already support execution summaries and case-level results.
- Existing execution pages and reports can display normalized Bruno results.

The main architectural change is introducing an execution engine abstraction so API automation can use Bruno without passing through Jenkins.

## Architecture
The target architecture has four layers:

1. Bruno Asset Layer
   - GitLab repository contains Bruno collections.
   - Bruno desktop remains the primary authoring/debugging tool.
   - Collection files are the source of truth.

2. Platform Synchronization Layer
   - Platform stores repository connection metadata.
   - Sync service pulls a selected branch/commit into a controlled workspace.
   - Parser reads collection/folder/request/environment metadata.
   - Parsed requests are mapped into platform API cases.

3. Platform Execution Layer
   - Task scheduler creates execution records.
   - `BrunoRunnerService` builds a safe `bru run` command from typed task config.
   - Runner emits JSON, JUnit, and HTML reports to an artifact directory.
   - Parser normalizes results and updates existing execution tables.

4. Integration Layer
   - Manual trigger uses existing `POST /api/tasks/:id/run`.
   - Scheduled trigger uses existing cron scheduler.
   - GitLab webhook trigger will map repository events to Bruno tasks.

## Execution Engine Model
Add an execution engine concept to tasks and runs.

Recommended engine values:

- `jenkins`: Existing external Jenkins flow.
- `bruno`: Native Bruno CLI flow.

Task execution config for Bruno should be stored as structured JSON, not as shell text:

```json
{
  "engine": "bruno",
  "repositoryId": 12,
  "collectionId": 34,
  "targetType": "collection",
  "targetPath": "collections/order-api",
  "environmentId": 5,
  "tags": ["smoke", "release-gate"],
  "timeoutMs": 600000,
  "reporters": ["json", "junit", "html"]
}
```

The runner is responsible for converting this validated config into CLI arguments. Users must never provide raw shell fragments.

## Data Model
Database table changes should be handled through DBA-reviewed migration scripts, consistent with project rules.

### Auto_BrunoRepositories
Stores GitLab repository mapping.

- `id`
- `name`
- `project_id`
- `git_url`
- `default_branch`
- `collection_root`
- `auth_secret_ref`
- `last_sync_commit`
- `last_sync_status`
- `last_sync_error`
- `created_by`
- `created_at`
- `updated_at`

### Auto_BrunoCollections
Stores parsed collection metadata.

- `id`
- `repository_id`
- `project_id`
- `name`
- `relative_path`
- `format`
- `request_count`
- `environment_count`
- `tags_json`
- `last_sync_commit`
- `created_at`
- `updated_at`

### Auto_BrunoRequests
Stores parsed request-level index data.

- `id`
- `collection_id`
- `case_id`
- `name`
- `method`
- `relative_path`
- `folder_path`
- `url_template`
- `tags_json`
- `has_tests`
- `has_scripts`
- `created_at`
- `updated_at`

### Auto_BrunoEnvironments
Stores platform-side environment mappings.

- `id`
- `repository_id`
- `project_id`
- `name`
- `bruno_env_name`
- `variables_json`
- `secret_refs_json`
- `created_by`
- `created_at`
- `updated_at`

### Existing Tables
Recommended additive changes:

- `Auto_TestCase.source`: use `bruno`.
- `Auto_TestCase.script_path`: store Bruno request/folder path.
- `Auto_TestCase.config_json`: store Bruno metadata such as collection ID, method, tags, and sync commit.
- `Auto_TestCaseTasks`: add `execution_engine` and `engine_config_json`.
- `Auto_TestRun.run_config`: include Bruno run config and report artifact paths.

## REST API Design
All new endpoints should use typed request/response contracts and consistent error bodies.

### Bruno Repositories
- `GET /api/bruno/repositories`
- `POST /api/bruno/repositories`
- `GET /api/bruno/repositories/:id`
- `PATCH /api/bruno/repositories/:id`
- `DELETE /api/bruno/repositories/:id`
- `POST /api/bruno/repositories/:id/sync`

### Bruno Collections
- `GET /api/bruno/collections?repositoryId=&projectId=`
- `GET /api/bruno/collections/:id`
- `GET /api/bruno/collections/:id/requests`
- `GET /api/bruno/collections/:id/environments`

### Bruno Task Preview
- `POST /api/bruno/run-preview`

This endpoint validates task config and returns the resolved run plan without executing it. It should show collection target, environment, tags, expected report paths, and warnings.

### Existing Task APIs
Extend `POST /api/tasks` and `PATCH /api/tasks/:id` to accept:

- `executionEngine: "bruno" | "jenkins"`
- `engineConfig`

Existing task endpoints should continue to work for Jenkins tasks.

### GitLab Webhook
Future endpoint:

- `POST /api/gitlab/webhooks/bruno`

The webhook handler should validate GitLab signature headers, map events to configured tasks, and enqueue `ci_triggered` executions.

## BrunoRunnerService
`BrunoRunnerService` is the main backend service for native API automation execution.

Responsibilities:

- Resolve repository checkout path by repository ID and commit.
- Validate collection/folder/request target path.
- Resolve environment variables and secret references.
- Build safe CLI arguments for `bru run`.
- Create per-run artifact directories.
- Execute Bruno with timeout and cancellation support.
- Capture stdout/stderr with sensitive data filtering.
- Write JSON, JUnit, and HTML reports.
- Parse report output into normalized results.
- Return a typed result object to the execution service.

The first release can run workers in the existing backend process, but the service boundary should allow later extraction into a separate worker.

## Result Normalization
Bruno results should map into platform fields as follows:

- Collection/folder/request run maps to one `Auto_TestRun`.
- Each Bruno request maps to one `Auto_TestRunResults` row when possible.
- Assertion failures map to `status = failed`.
- Request execution errors map to `status = error`.
- Skipped or filtered requests map to `status = skipped` only when Bruno reports them.
- HTML report path is stored in `Auto_TestRun.run_config.reportHtmlPath`.
- JSON/JUnit paths are stored in `Auto_TestRun.run_config.artifacts`.

Sensitive request headers, request bodies, and response bodies should not be stored unless explicitly enabled by an admin-level setting.

## UI Design
### API Cases
Upgrade the API cases page into a Bruno-aware workspace:

- Repository selector.
- Collection tree with folders and requests.
- Method, URL template, tags, and sync commit columns.
- Filters for collection, folder, method, tag, owner, and search keyword.
- Sync status and last sync commit display.

### Task Creation
For `executionEngine = bruno`, task form should support:

- Repository.
- Collection.
- Target type: collection, folder, request, or tag selection.
- Environment.
- Tags.
- Cron expression for scheduled tasks.
- Timeout and retry policy.
- Run preview before save.

### Execution Detail
Execution detail should show:

- Overall status, duration, passed/failed/skipped/error counts.
- Failed requests with assertion message and response summary.
- Link to Bruno HTML report.
- Artifact list for JSON/JUnit/HTML.
- Trigger source: manual, scheduled, or GitLab.

## Security
- Store Git credentials and environment secrets as secret references, not plaintext task config.
- Do not pass user-controlled shell fragments into `bru run`.
- Use argument arrays and strict allowlists for CLI flags.
- Restrict checkout and artifact paths to platform-controlled directories.
- Redact authorization, cookie, API key, and configured secret values from logs and reports.
- Validate GitLab webhook signatures before enqueueing work.
- Add per-task timeout and global concurrency limits.

## Error Handling
Use explicit error categories:

- `REPOSITORY_SYNC_FAILED`
- `COLLECTION_PARSE_FAILED`
- `BRUNO_CLI_NOT_FOUND`
- `BRUNO_RUN_FAILED`
- `BRUNO_REPORT_MISSING`
- `BRUNO_REPORT_PARSE_FAILED`
- `SECRET_RESOLUTION_FAILED`
- `TASK_CONFIG_INVALID`

Errors should be visible in execution detail, but internal paths, tokens, and raw command output should be redacted.

## Testing Strategy
Backend tests:

- Bruno config validation.
- Safe CLI argument construction.
- Report parser for success, assertion failure, request error, and malformed report.
- Scheduler dispatch to `BrunoRunnerService`.
- Cancellation and timeout behavior.
- GitLab webhook signature validation.

Frontend tests:

- API cases collection tree rendering.
- Task form validation for Bruno tasks.
- Run preview states.
- Execution detail rendering for Bruno reports.

Integration tests:

- Use a small fixture Bruno collection in `test_case`.
- Run a mocked or real `bru run` behind a test seam.
- Verify normalized `Auto_TestRun` and `Auto_TestRunResults` output.

## Phased Delivery
### Phase 1: Manual Bruno Execution
- Add Bruno repository registration.
- Sync and parse one GitLab-hosted Bruno collection.
- Create platform API cases from parsed requests.
- Add `BrunoRunnerService`.
- Execute a Bruno task manually.
- Parse JSON/HTML artifacts into execution summary.

### Phase 2: Scheduler Integration
- Add `execution_engine` support to tasks.
- Route Bruno tasks through existing scheduler.
- Support cron, retries, timeout, queue status, and WebSocket progress.
- Add cancellation support.

### Phase 3: Platform Experience
- Improve API cases collection tree.
- Add environment and tag selection.
- Add run preview.
- Add failure aggregation and report detail polish.

### Phase 4: GitLab Triggering
- Add GitLab webhook endpoint.
- Map push/MR/release events to Bruno tasks.
- Support branch and tag rules.
- Show CI-triggered executions in task history.

## Risks And Mitigations
- Bruno report schema may change. Mitigate by isolating parsing in one adapter and adding fixture tests.
- Collections may contain unsupported Postman-style scripts after migration. Mitigate by surfacing parse/run warnings in sync and execution detail.
- Secret leakage through reports is possible. Mitigate with reporter skip flags, log redaction, and default body/header storage limits.
- Long-running API tests can starve the backend. Mitigate with concurrency limits and future worker extraction.
- Git conflicts or invalid collection files can break sync. Mitigate by preserving last successful sync and showing sync diagnostics.

## References
- Bruno documentation: https://docs.usebruno.com/
- Bruno CLI command options: https://docs.usebruno.com/bru-cli/commandOptions
- Bruno Git integration: https://docs.usebruno.com/git-integration/overview
- Current platform task scheduler: `server/services/TaskSchedulerService`
- Current platform execution model: `server/services/ExecutionService`
