# Unit Test Coverage Expansion Design

## Status: Approved

## Date: 2026-05-24

## Background

The project currently has ~24% test coverage across 29 test files (19 backend, 12 frontend). Critical gaps include backend repositories (0%), backend routes (9.1%), auth middleware (untested), and frontend core components (~10%). This design outlines a phased approach to systematically expand test coverage.

## Current Coverage Summary

| Category | Covered | Total | Coverage |
|----------|---------|-------|----------|
| Backend Services | 6 | 19 | 31.6% |
| Backend Routes | 1 | 11 | 9.1% |
| Backend Middleware | 1 | 5 | 20% |
| Backend Repositories | 0 | 14 | 0% |
| Backend Utils | 5 | 10 | 50% |
| Frontend Pages | 8 | 19 | 42% |
| Frontend Components | 2 | 20+ | ~10% |
| Frontend Hooks | 1 | 5 | 20% |
| Frontend Services | 1 | 2 | 50% |

## Decision

Expand test coverage in 4 phases, prioritizing security-critical and data-access layers first.

## Test Conventions

- Framework: Vitest + React Testing Library + jsdom
- Backend tests: `test_case/backend/{category}/{name}.test.ts`
- Frontend tests: `test_case/frontend/{category}/{name}.test.tsx`
- Use `vi.mock()` for dependencies, `vi.hoisted()` for mock instances
- Use `describe()` / `it()` blocks, descriptive test names
- Backend route tests: test pure logic functions (validation, normalization) extracted from handlers
- Frontend component tests: render with QueryClientProvider wrapper, mock hooks and UI libs

## Phase 1: Backend Security Core

### 1.1 Auth Middleware (`server/middleware/auth.ts`)

File: `test_case/backend/middleware/auth.test.ts`

Test cases:
- `authenticate`: missing Authorization header → 401
- `authenticate`: malformed token (no "Bearer " prefix) → 401
- `authenticate`: invalid/expired token → 401
- `authenticate`: valid token → sets `req.user`, calls `next()`
- `optionalAuth`: no header → passes through without user
- `optionalAuth`: valid token → sets `req.user`
- `optionalAuth`: invalid token → passes through without user
- `requireRole('admin')`: no `req.user` → 401
- `requireRole('admin')`: wrong role → 403
- `requireRole('admin')`: correct role → calls `next()`
- `requireRole('admin', 'tester')`: tester role → calls `next()`
- `requireAdmin`: delegates to `requireRole('admin')`
- `requireTester`: delegates to `requireRole('admin', 'tester', 'developer')`

Mocks: `authService.verifyToken`, `logger`

### 1.2 Auth Routes (`server/routes/auth.ts`)

File: `test_case/backend/routes/auth.route.test.ts`

Test cases:
- POST `/register`: missing fields → 400
- POST `/register`: invalid email format → 400
- POST `/register`: password too short → 400
- POST `/register`: username too short → 400
- POST `/register`: success → 201 with user data
- POST `/login`: missing credentials → 400
- POST `/login`: success → 200 with token
- POST `/logout`: no auth → 401
- POST `/logout`: success → 200
- GET `/me`: no auth → 401
- GET `/me`: success → 200 with user data
- POST `/forgot-password`: missing email → 400
- POST `/reset-password`: missing token/password → 400
- POST `/refresh`: missing token → 400

Mocks: `authService`, `authenticate` middleware

### 1.3 UserRepository (`server/repositories/UserRepository.ts`)

File: `test_case/backend/repositories/UserRepository.test.ts`

Test cases:
- `findByEmail`: returns user when found, null when not
- `findByUsername`: returns user when found, null when not
- `findById`: returns user when found, null when not
- `findByResetToken`: returns user with valid non-expired token, null when expired
- `findByRememberToken`: returns user with matching token
- `createUser`: creates with default status='active', loginAttempts=0
- `updateLoginAttempts`: updates count correctly
- `lockUser` / `unlockUser`: updates lock fields
- `updateLastLogin`: updates timestamp
- `setResetToken`: stores token and expiry
- `resetPassword`: updates hash, clears token
- `setRememberToken`: stores/clears token

Mocks: TypeORM `Repository` (findOne, update, create, save, createQueryBuilder)

### 1.4 TestCaseRepository (`server/repositories/TestCaseRepository.ts`)

File: `test_case/backend/repositories/TestCaseRepository.test.ts`

Test cases:
- `findById`: returns case when found, null when not
- `findByName`: returns case when found
- `findByScriptPath`: returns case when found
- `findAll`: applies type/priority filters, pagination
- `createTestCase`: handles JSON config and tags parsing
- `updateTestCaseSafe`: validates JSON fields before update
- `deleteTestCase`: deletes by ID
- `count`: handles comma-separated multi-value filters
- `findAllWithUser`: joins user data
- `getDistinctOwners` / `getDistinctModules`: returns unique values
- `createTestCasesBatch`: batch insert in transaction
- `updateTestCasesBatch`: batch update in transaction
- `deleteTestCasesBatch`: validates existence before delete

Mocks: TypeORM `Repository`, `DataSource`, `QueryRunner`

## Phase 2: Backend Routes

### 2.1 Cases Routes (`server/routes/cases.ts`)

File: `test_case/backend/routes/cases.route.test.ts`

Test cases:
- GET `/`: default pagination (limit=20, offset=0)
- GET `/`: custom pagination with limit cap at 500
- GET `/`: projectId NaN → 400
- GET `/`: filters (module, enabled, type, search, priority, owner)
- GET `/`: database error → 500
- Response mapping: snake_case to camelCase conversion

Mocks: `TestCaseRepository`, `AppDataSource`, `logger`

### 2.2 Executions Routes (`server/routes/executions.ts`)

File: `test_case/backend/routes/executions.route.test.ts`

Test cases:
- POST `/callback`: missing executionId → 400
- POST `/callback`: missing status → 400
- POST `/callback`: missing results array → 400
- POST `/callback`: success → 200
- POST `/:id/start`: invalid ID → 400
- POST `/:id/start`: success → 200
- GET `/test-runs`: pagination and filter params

Mocks: `executionService`, `query`, `logger`

### 2.3 Dashboard Routes (`server/routes/dashboard.ts`)

File: `test_case/backend/routes/dashboard.route.test.ts`

Test cases:
- GET `/stats`: success → 200 with stats object
- GET `/stats`: service error → 500
- GET `/today-execution`: success → 200
- GET `/trend`: days parameter validation (1-365)
- GET `/trend`: invalid days → 400
- Cache-Control headers set correctly

Mocks: `dashboardService`, `dailySummaryScheduler`, `logger`

### 2.4 Jenkins Routes (`server/routes/jenkins.ts`)

File: `test_case/backend/routes/jenkins.route.test.ts`

Test cases:
- POST `/trigger`: missing jobId → 400
- POST `/trigger`: success → 200
- GET `/status/:id`: invalid ID → 400
- GET `/status/:id`: not found → 404
- GET `/config`: returns configuration

Mocks: `jenkinsService`, `authenticate`, `requireTester`

## Phase 3: Frontend Hooks + Core Components

### 3.1 useTasks Hook (`src/hooks/useTasks.ts`)

File: `test_case/frontend/hooks/useTasks.test.ts`

Test cases:
- `runWithConcurrencyLimit`: empty array → empty result
- `runWithConcurrencyLimit`: respects concurrency limit
- `runWithConcurrencyLimit`: handles errors in individual items
- `buildAuthHeaders`: includes token when present
- `buildAuthHeaders`: omits token when absent
- `useTasks`: constructs correct query URL with params
- `useRunTask`: sends POST request with correct body
- `useUpdateTaskStatus`: optimistic update and rollback on error
- `useDeleteTask`: optimistic removal and rollback on error
- `useBatchRunTask`: respects concurrency limit

Mocks: `fetch`, `getToken`, `@tanstack/react-query`

### 3.2 useExecutions Hook (`src/hooks/useExecutions.ts`)

File: `test_case/frontend/hooks/useExecutions.test.ts`

Test cases:
- `useTestRuns`: constructs query with filters
- `useTestRunDetail`: polls every 3s for running status
- `useTestRunDetail`: stops polling for terminal status
- `useTestRunResults`: includes auth token in fetch
- `useJenkinsHealthStatus`: returns connected:false on error
- `useStaleExecutionSummary`: correct query params

Mocks: `request`, `fetch`, `@tanstack/react-query`

### 3.3 ProtectedRoute Component (`src/components/ProtectedRoute.tsx`)

File: `test_case/frontend/components/ProtectedRoute.test.tsx`

Test cases:
- loading state → renders spinner
- unauthenticated → redirects to `/login`
- unauthenticated → encodes current path as returnUrl
- authenticated → renders children

Mocks: `useAuth`, `useLocation`, `wouter/Redirect`

### 3.4 ErrorBoundary Component (`src/components/ErrorBoundary.tsx`)

File: `test_case/frontend/components/ErrorBoundary.test.tsx`

Test cases:
- no error → renders children normally
- child throws → renders fallback UI
- child throws → logs error

Mocks: console.error (suppress)

## Phase 4: Frontend Components + Utilities

### 4.1 Sidebar Component (`src/components/Sidebar.tsx`)

File: `test_case/frontend/components/Sidebar.test.tsx`

Test cases:
- renders all navigation items
- highlights active item based on current route
- expands/collapses child sections
- logout button calls logout and navigates

Mocks: `useLocation`, `useAuth`, `useNavCollapse`, `useAiGeneration`, `createPortal`

### 4.2 Layout Component (`src/components/Layout.tsx`)

File: `test_case/frontend/components/Layout.test.tsx`

Test cases:
- renders Sidebar and children
- applies correct layout structure

Mocks: `Sidebar`

### 4.3 useCases Hook (`src/hooks/useCases.ts`)

File: `test_case/frontend/hooks/useCases.test.ts`

Test cases:
- `useCases`: constructs query with filters
- `useCreateCase`: sends POST and invalidates cache
- `useUpdateCase`: sends PATCH and invalidates cache
- `useDeleteCase`: sends DELETE and invalidates cache

Mocks: `request`, `@tanstack/react-query`

### 4.4 authApi Service (`src/services/authApi.ts`)

File: `test_case/frontend/services/authApi.test.ts`

Test cases:
- `getToken`: returns token from localStorage
- `setToken`: stores token in localStorage
- `clearToken`: removes token from localStorage
- `login`: sends POST and stores token
- `logout`: sends POST and clears token

Mocks: `localStorage`, `fetch`

### 4.5 ServiceError Utility (`server/utils/ServiceError.ts`)

File: `test_case/backend/utils/ServiceError.test.ts`

Test cases:
- constructs with message and code
- preserves stack trace
- instanceof Error check

### 4.6 Type Validation Utility (`server/utils/type-validation.ts`)

File: `test_case/backend/utils/typeValidation.test.ts`

Test cases:
- validates email format
- validates password strength
- validates required fields
- sanitizes string inputs

## File Structure

```
test_case/
├── backend/
│   ├── middleware/
│   │   ├── authRateLimiter.test.ts    (existing)
│   │   └── auth.test.ts              (Phase 1)
│   ├── repositories/
│   │   ├── UserRepository.test.ts     (Phase 1)
│   │   └── TestCaseRepository.test.ts (Phase 1)
│   ├── routes/
│   │   ├── tasks.route.test.ts        (existing)
│   │   ├── auth.route.test.ts         (Phase 1)
│   │   ├── cases.route.test.ts        (Phase 2)
│   │   ├── executions.route.test.ts   (Phase 2)
│   │   ├── dashboard.route.test.ts    (Phase 2)
│   │   └── jenkins.route.test.ts      (Phase 2)
│   └── utils/
│       ├── ServiceError.test.ts       (Phase 4)
│       └── typeValidation.test.ts     (Phase 4)
├── frontend/
│   ├── components/
│   │   ├── ThemeToggle.test.tsx        (existing)
│   │   ├── AiCaseSidebar.test.tsx      (existing)
│   │   ├── ProtectedRoute.test.tsx     (Phase 3)
│   │   ├── ErrorBoundary.test.tsx      (Phase 3)
│   │   ├── Sidebar.test.tsx            (Phase 4)
│   │   └── Layout.test.tsx             (Phase 4)
│   ├── hooks/
│   │   ├── useExecuteCase.test.tsx     (existing)
│   │   ├── useTasks.test.ts            (Phase 3)
│   │   ├── useExecutions.test.ts       (Phase 3)
│   │   └── useCases.test.ts            (Phase 4)
│   └── services/
│       └── authApi.test.ts             (Phase 4)
```

## Expected Outcome

- New test files: ~20
- Target coverage after completion: ~50-60%
- Each phase is independently mergeable
- No changes to production code required
