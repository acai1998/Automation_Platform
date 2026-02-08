import { Request, Response, NextFunction } from 'express';

interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'array' | 'object' | 'boolean';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  arrayItemType?: 'string' | 'number';
  allowedValues?: any[];
}

interface ValidationSchema {
  body?: ValidationRule[];
  params?: ValidationRule[];
  query?: ValidationRule[];
}

export class RequestValidator {
  /**
   * Jenkins回调参数校验
   */
  validateCallback = (req: Request, res: Response, next: NextFunction): void => {
    const schema: ValidationSchema = {
      body: [
        {
          field: 'runId',
          type: 'number',
          required: true,
          min: 1
        },
        {
          field: 'status',
          type: 'string',
          required: true,
          allowedValues: ['success', 'failed', 'aborted', 'cancelled']
        },
        {
          field: 'passedCases',
          type: 'number',
          required: false,
          min: 0
        },
        {
          field: 'failedCases',
          type: 'number',
          required: false,
          min: 0
        },
        {
          field: 'skippedCases',
          type: 'number',
          required: false,
          min: 0
        },
        {
          field: 'durationMs',
          type: 'number',
          required: false,
          min: 0,
          max: 24 * 60 * 60 * 1000 // 最大24小时
        },
        {
          field: 'results',
          type: 'array',
          required: false
        }
      ]
    };

    const validation = this.validate(req, schema);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: validation.errors.join(', '),
        details: validation.errors
      });
      return;
    }

    // 额外的业务逻辑校验
    const { passedCases = 0, failedCases = 0, skippedCases = 0, results = [] } = req.body;

    // 校验用例数量一致性
    const totalReportedCases = passedCases + failedCases + skippedCases;
    if (results.length > 0 && results.length !== totalReportedCases) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: `Results count (${results.length}) does not match total cases (${totalReportedCases})`
      });
      return;
    }

    // 校验结果数组格式
    if (results.length > 0) {
      const resultValidation = this.validateResults(results);
      if (!resultValidation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Results validation failed',
          message: resultValidation.errors.join(', '),
          details: resultValidation.errors
        });
        return;
      }
    }

    next();
  };

  /**
   * 批量执行参数校验
   */
  validateBatchExecution = (req: Request, res: Response, next: NextFunction): void => {
    const schema: ValidationSchema = {
      body: [
        {
          field: 'caseIds',
          type: 'array',
          required: true,
          arrayItemType: 'number'
        },
        {
          field: 'projectId',
          type: 'number',
          required: true,
          min: 1
        },
        {
          field: 'triggeredBy',
          type: 'number',
          required: false,
          min: 1
        }
      ]
    };

    const validation = this.validate(req, schema);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: validation.errors.join(', '),
        details: validation.errors
      });
      return;
    }

    // 校验用例ID数组
    const { caseIds } = req.body;
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'caseIds must be a non-empty array'
      });
      return;
    }

    if (caseIds.length > 100) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Cannot execute more than 100 cases at once'
      });
      return;
    }

    // 检查重复ID
    const uniqueIds = new Set(caseIds);
    if (uniqueIds.size !== caseIds.length) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Duplicate case IDs found in caseIds array'
      });
      return;
    }

    next();
  };

  /**
   * 单用例执行参数校验
   */
  validateSingleExecution = (req: Request, res: Response, next: NextFunction): void => {
    const schema: ValidationSchema = {
      body: [
        {
          field: 'caseId',
          type: 'number',
          required: true,
          min: 1
        },
        {
          field: 'projectId',
          type: 'number',
          required: true,
          min: 1
        },
        {
          field: 'triggeredBy',
          type: 'number',
          required: false,
          min: 1
        }
      ]
    };

    const validation = this.validate(req, schema);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: validation.errors.join(', '),
        details: validation.errors
      });
      return;
    }

    next();
  };

  /**
   * 通用参数校验
   */
  private validate(req: Request, schema: ValidationSchema): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 校验请求体
    if (schema.body) {
      for (const rule of schema.body) {
        const error = this.validateField(req.body, rule, 'body');
        if (error) errors.push(error);
      }
    }

    // 校验路径参数
    if (schema.params) {
      for (const rule of schema.params) {
        const error = this.validateField(req.params, rule, 'params');
        if (error) errors.push(error);
      }
    }

    // 校验查询参数
    if (schema.query) {
      for (const rule of schema.query) {
        const error = this.validateField(req.query, rule, 'query');
        if (error) errors.push(error);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 校验单个字段
   */
  private validateField(data: any, rule: ValidationRule, source: string): string | null {
    const value = data[rule.field];
    const fieldPath = `${source}.${rule.field}`;

    // 必填字段检查
    if (rule.required && (value === undefined || value === null)) {
      return `${fieldPath} is required`;
    }

    // 如果字段不存在且非必填，跳过后续检查
    if (value === undefined || value === null) {
      return null;
    }

    // 类型检查
    const typeError = this.validateType(value, rule.type, fieldPath);
    if (typeError) return typeError;

    // 字符串长度检查
    if (rule.type === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        return `${fieldPath} must be at least ${rule.minLength} characters long`;
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        return `${fieldPath} must be no more than ${rule.maxLength} characters long`;
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        return `${fieldPath} format is invalid`;
      }
    }

    // 数字范围检查
    if (rule.type === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        return `${fieldPath} must be at least ${rule.min}`;
      }
      if (rule.max !== undefined && value > rule.max) {
        return `${fieldPath} must be no more than ${rule.max}`;
      }
    }

    // 数组类型检查
    if (rule.type === 'array') {
      if (rule.arrayItemType) {
        for (let i = 0; i < value.length; i++) {
          const itemTypeError = this.validateType(value[i], rule.arrayItemType, `${fieldPath}[${i}]`);
          if (itemTypeError) return itemTypeError;
        }
      }
    }

    // 允许值检查
    if (rule.allowedValues && !rule.allowedValues.includes(value)) {
      return `${fieldPath} must be one of: ${rule.allowedValues.join(', ')}`;
    }

    return null;
  }

  /**
   * 类型校验
   */
  private validateType(value: any, expectedType: string, fieldPath: string): string | null {
    switch (expectedType) {
      case 'string':
        if (typeof value !== 'string') {
          return `${fieldPath} must be a string`;
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return `${fieldPath} must be a valid number`;
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return `${fieldPath} must be a boolean`;
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return `${fieldPath} must be an array`;
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          return `${fieldPath} must be an object`;
        }
        break;
    }
    return null;
  }

  /**
   * 校验测试结果数组
   */
  private validateResults(results: any[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const prefix = `results[${i}]`;

      if (typeof result !== 'object' || result === null) {
        errors.push(`${prefix} must be an object`);
        continue;
      }

      // 校验必填字段
      if (typeof result.caseId !== 'number' || result.caseId <= 0) {
        errors.push(`${prefix}.caseId must be a positive number`);
      }

      if (typeof result.caseName !== 'string' || result.caseName.trim().length === 0) {
        errors.push(`${prefix}.caseName must be a non-empty string`);
      }

      if (!['passed', 'failed', 'skipped', 'error'].includes(result.status)) {
        errors.push(`${prefix}.status must be one of: passed, failed, skipped, error`);
      }

      if (typeof result.duration !== 'number' || result.duration < 0) {
        errors.push(`${prefix}.duration must be a non-negative number`);
      }

      // 可选字段校验
      if (result.errorMessage !== undefined && typeof result.errorMessage !== 'string') {
        errors.push(`${prefix}.errorMessage must be a string`);
      }

      // 新增诊断字段校验 (可选)
      if (result.stackTrace !== undefined && typeof result.stackTrace !== 'string') {
        errors.push(`${prefix}.stackTrace must be a string`);
      }

      if (result.screenshotPath !== undefined && typeof result.screenshotPath !== 'string') {
        errors.push(`${prefix}.screenshotPath must be a string`);
      }

      if (result.logPath !== undefined && typeof result.logPath !== 'string') {
        errors.push(`${prefix}.logPath must be a string`);
      }

      if (result.assertionsTotal !== undefined && (typeof result.assertionsTotal !== 'number' || result.assertionsTotal < 0)) {
        errors.push(`${prefix}.assertionsTotal must be a non-negative number`);
      }

      if (result.assertionsPassed !== undefined && (typeof result.assertionsPassed !== 'number' || result.assertionsPassed < 0)) {
        errors.push(`${prefix}.assertionsPassed must be a non-negative number`);
      }

      if (result.responseData !== undefined && typeof result.responseData !== 'string') {
        errors.push(`${prefix}.responseData must be a string`);
      }

      // 逻辑校验：通过的断言数不能超过总断言数
      if (result.assertionsTotal !== undefined && result.assertionsPassed !== undefined) {
        if (result.assertionsPassed > result.assertionsTotal) {
          errors.push(`${prefix}.assertionsPassed cannot exceed assertionsTotal`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// 导出单例实例
export const requestValidator = new RequestValidator();