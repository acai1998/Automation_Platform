/**
 * Database Type Definitions
 *
 * This file contains TypeScript interfaces for database query results
 * to replace unsafe 'as any' type assertions throughout the codebase.
 */

/**
 * Generic database query result wrapper
 */
export type DbQueryResult<T> = T[];

/**
 * Execution record from Auto_TestCaseTaskExecutions table
 */
export interface ExecutionRecord {
  id: number;
  task_id?: number;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Test result record from Auto_TestRunResults table
 */
export interface TestResultRecord {
  id?: number;
  execution_id: number;
  case_id: number;
  case_name?: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  result?: string;
  duration?: number;
  error_message?: string;
  error_stack?: string;
  screenshot_path?: string;
  log_path?: string;
  assertions_total?: number;
  assertions_passed?: number;
  response_data?: string;
  start_time?: Date;
  end_time?: Date;
  created_at?: Date;
}

/**
 * Test run record from Auto_TestRun table
 */
export interface TestRunRecord {
  id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  trigger_type: 'manual' | 'jenkins' | 'schedule';
  trigger_by: number;
  trigger_by_name?: string;
  project_id?: number;
  jenkins_job?: string;
  jenkins_build_id?: string;
  jenkins_url?: string;
  total_cases?: number;
  passed_cases?: number;
  failed_cases?: number;
  skipped_cases?: number;
  duration_ms?: number;
  start_time?: Date;
  end_time?: Date;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * User record from Auto_Users table
 */
export interface UserRecord {
  id: number;
  username: string;
  email?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Test case record from Auto_TestCase table
 */
export interface TestCaseRecord {
  id: number;
  name: string;
  description?: string;
  type: 'api' | 'ui' | 'performance';
  script_path?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Daily summary record from Auto_TestCaseDailySummaries table
 */
export interface DailySummaryRecord {
  id: number;
  date: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  success_rate: number;
  created_at?: Date;
}

/**
 * MySQL result metadata for INSERT/UPDATE/DELETE operations
 */
export interface MySQLResultMetadata {
  affectedRows: number;
  insertId: number;
  warningStatus: number;
}

/**
 * Type-safe database query result with metadata
 */
export type DatabaseQueryResult<T> = [DbQueryResult<T>, MySQLResultMetadata];

/**
 * Error types for better error handling
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public query?: string,
    public params?: any[]
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    public executionId?: number,
    public runId?: number
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

export class JenkinsIntegrationError extends Error {
  constructor(
    message: string,
    public jenkinsUrl?: string,
    public jobName?: string
  ) {
    super(message);
    this.name = 'JenkinsIntegrationError';
  }
}