/**
 * TypeScript 类型安全验证
 * 验证修复后的类型定义是否正确
 */

import { DashboardRepository } from '../repositories/DashboardRepository';
import { ServiceError } from '../utils/ServiceError';
import { DashboardStats, TodayExecution, RecentRun } from '../repositories/DashboardRepository';

// 类型验证示例
function validateTypes() {
  // 1. DashboardStats 类型验证
  const stats: DashboardStats = {
    totalCases: 100,
    todayRuns: 50,
    todaySuccessRate: 95.5,
    runningTasks: 5,
  };

  // 2. TodayExecution 类型验证
  const execution: TodayExecution = {
    total: 100,
    passed: 95,
    failed: 3,
    skipped: 2,
  };

  // 3. RecentRun 类型验证
  const run: RecentRun = {
    id: 123,
    suiteName: 'Login Test Suite',
    status: 'completed',
    duration: 1500,
    totalCases: 10,
    passedCases: 9,
    failedCases: 1,
    executedBy: 'user@example.com',
    executedById: 456,
  };

  // 4. ServiceError 类型验证
  const businessError = ServiceError.business('Invalid input', { field: 'name' });
  const dataAccessError = ServiceError.dataAccess('Database error', new Error('Connection failed'));
  const validationError = ServiceError.validation('Validation failed', { errors: ['Field required'] });
  const notFoundError = ServiceError.notFound('User', '123');
  const forbiddenError = ServiceError.forbidden('delete user');

  // 5. 错误响应类型验证
  const errorResponse = businessError.toResponse();
  
  // 类型安全检查 - 这些应该在编译时通过
  const totalCases: number = stats.totalCases;
  const successRate: number | null = stats.todaySuccessRate;
  const passedCount: number = execution.passed;
  const suiteName: string | undefined = run.suiteName;
  const statusCode: number = businessError.statusCode;
  const errorMessage: string = errorResponse.error;
  const errorTimestamp: string = errorResponse.timestamp;

  console.log('✅ 所有类型定义验证通过');
  console.log('Stats:', { totalCases, successRate });
  console.log('Execution:', { passedCount });
  console.log('Run:', { suiteName });
  console.log('Error:', { statusCode, errorMessage, errorTimestamp });
}

// 运行类型验证
validateTypes();