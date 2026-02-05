# AGENTS.md - Development Guidelines

This file contains essential development commands and coding guidelines for agents working in this repository.

## Build/Lint/Test Commands

### Development
```bash
npm run start          # Start both frontend (5173) and backend (3000)
npm run dev            # Start frontend only (Vite dev server)
npm run server         # Start backend only (Express with tsx)
```

### Build
```bash
npm run build          # Build production frontend
npm run server:build   # Build backend TypeScript
npm run preview        # Preview built frontend
```

### Testing
```bash
npx vitest             # Run all tests with watch mode
npx vitest --watch     # Explicitly enable watch mode
npx vitest run         # Run tests once (no watch)
npx vitest --coverage  # Run tests with coverage
npx vitest src/components/__tests__/Component.test.tsx  # Run single test file
```

### Type Checking
```bash
npx tsc --noEmit -p tsconfig.json      # Frontend type check
npx tsc --noEmit -p tsconfig.server.json  # Backend type check
```

## Code Style Guidelines

### TypeScript Requirements
- **Must use TypeScript** - No JavaScript files allowed
- **Strict typing** - No `any` types (use `unknown` or specific types)
- **Full interfaces** - All props, parameters, and return values must be typed
- **Strict mode** - Enabled in both tsconfig files

### Imports and Path Aliases
- Use path aliases: `@/*` → `./src/*`, `@shared/*` → `./shared/*`
- Import order: external libraries → shared types → local components
- Use absolute imports: `import { Button } from '@/components/ui/button'`

### React Component Standards
- **Function components only** - No class components
- **File naming** - Component files must match component name (e.g., `Button.tsx`)
- **Export naming** - Default export must match filename
- **Hooks usage** - Use modern React hooks patterns

### Code Organization
- **Frontend code** - Only in `src/` directory
- **Backend code** - Only in `server/` directory
- **Test files** - Must be in `src/components/__tests__/` directory with `.test.tsx` extension
- **Shared types** - Place in `shared/` directory

### Testing Standards
- **Framework**: Vitest + React Testing Library + jsdom
- **Mocking**: Use `vi.mock()` for UI components
- **Structure**: Use `describe()` and `it()` blocks
- **Setup**: Tests configured in `vite.config.ts`, setup in `src/test/setup.ts`

### Database Operations
- **No hardcoded SQL** - All DB operations through `server/config/database.ts` connection pool
- **Table structure** - Managed by DBA, don't initialize tables locally
- **Key tables**: Auto_TestCase, Auto_TestRun, Auto_TestRunResults, Auto_Users

### Jenkins Integration
- **Async execution** - Non-blocking design with 3-second polling
- **Script paths** - Use pytest format: `test_case/file.py::TestClass::test_method`
- **Callback data** - Must include runId, status, duration, and results array
- **Authentication** - Support API Key, JWT Token, or signature methods

### Error Handling
- **Try-catch blocks** - Always wrap async operations
- **User feedback** - Display friendly error messages in UI
- **Detailed logging** - Include context for debugging

### Naming Conventions
- **PascalCase** - Classes and interfaces
- **camelCase** - Functions and variables
- **kebab-case** - Files and directories
- **Consistent exports** - Match filename exactly

### Performance Standards
- **Polling interval** - 3000ms for real-time updates
- **API response** - Under 500ms average
- **Frontend load** - Under 3s for initial page load
- **Cache management** - Use TanStack Query for server state

### Git Workflow
- **Commit messages** - Focus on "why" not "what"
- **File modifications** - Only modify files in `src/` (frontend) or `server/` (backend)
- **No generated files** - Don't commit `node_modules/`, `dist/`, or build artifacts
- **Path aliases** - Never modify existing alias configurations

## Project Structure
```
├── src/              # Frontend (React 18 + TypeScript)
├── server/           # Backend (Express + TypeScript)
├── shared/           # Shared type definitions
├── configs/          # Configuration files
├── tests/            # Test files
└── docs/             # Documentation
```

## Important Constraints
- **No any types** - Strict TypeScript enforcement
- **No hardcoded SQL** - Database abstraction required
- **No static charts** - Use Recharts library with real data
- **T-1 data rule** - Statistical data excludes current day
- **Path alias usage** - Required for all internal imports