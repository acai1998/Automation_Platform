/**
 * 统一 API 响应类型定义
 *
 * 所有 REST 端点应遵循以下规范：
 * - 成功单条：ApiResponse<T>
 * - 成功列表：PaginatedResponse<T>
 * - 错误响应：ApiErrorResponse
 *
 * @see API and Interface Design Skill
 */

// ============================================================================
// 成功响应
// ============================================================================

/**
 * 单条资源成功响应
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * 列表资源分页成功响应（所有列表端点应使用此格式）
 *
 * 示例：
 * ```json
 * {
 *   "success": true,
 *   "data": [...],
 *   "total": 142,
 *   "pagination": { "limit": 20, "offset": 0, "hasMore": true }
 * }
 * ```
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * 无数据成功响应（用于 DELETE、操作类接口）
 */
export interface ApiSuccessResponse {
  success: true;
  message: string;
}

// ============================================================================
// 错误响应
// ============================================================================

/**
 * 统一错误响应格式
 *
 * 所有端点的错误响应应遵循此格式，不得使用裸 { success: false, message } 格式
 *
 * HTTP 状态码映射：
 * - 400 → VALIDATION_ERROR（客户端传入无效数据）
 * - 401 → UNAUTHORIZED（未认证）
 * - 403 → FORBIDDEN（已认证但无权限）
 * - 404 → NOT_FOUND（资源不存在）
 * - 409 → CONFLICT（版本冲突、重复数据）
 * - 422 → VALIDATION_ERROR（语义上无效的数据）
 * - 500 → INTERNAL_ERROR（服务器内部错误，不暴露内部细节）
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    /** 机器可读错误码 */
    code: string;
    /** 人类可读错误描述 */
    message: string;
    /** 附加上下文信息（如校验失败详情） */
    details?: unknown;
  };
}

// ============================================================================
// 辅助类型
// ============================================================================

/** 列表端点通用查询参数 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/** 构建分页元数据 */
export function buildPagination(
  limit: number,
  offset: number,
  total: number
): PaginatedResponse<never>['pagination'] {
  return {
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}
