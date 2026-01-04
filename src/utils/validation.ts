/**
 * 表单验证工具函数
 */

export interface ValidationResult {
  valid: boolean;
  message: string;
}

/**
 * 密码强度信息
 */
export interface PasswordStrength {
  level: number;
  text: string;
  color: string;
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { valid: false, message: '请输入邮箱地址' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, message: '邮箱格式不正确' };
  }
  return { valid: true, message: '' };
}

/**
 * 验证用户名
 * - 长度 2-50 字符
 * - 只允许字母、数字、下划线和中文
 */
export function validateUsername(username: string): ValidationResult {
  if (!username) {
    return { valid: false, message: '请输入用户名' };
  }
  if (username.length < 2 || username.length > 50) {
    return { valid: false, message: '用户名长度应在 2-50 个字符之间' };
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
    return { valid: false, message: '用户名只能包含字母、数字、下划线和中文' };
  }
  return { valid: true, message: '' };
}

/**
 * 验证密码
 * - 长度 6-100 字符
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, message: '请输入密码' };
  }
  if (password.length < 6) {
    return { valid: false, message: '密码长度至少为 6 位' };
  }
  if (password.length > 100) {
    return { valid: false, message: '密码长度不能超过 100 位' };
  }
  return { valid: true, message: '' };
}

/**
 * 计算密码强度
 * @returns level: 0-3, text: 强度描述, color: Tailwind 颜色类
 */
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { level: 0, text: '', color: '' };
  }

  let strength = 0;
  if (password.length >= 6) strength++;
  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

  if (strength <= 2) return { level: 1, text: '弱', color: 'bg-red-500' };
  if (strength <= 3) return { level: 2, text: '中', color: 'bg-yellow-500' };
  return { level: 3, text: '强', color: 'bg-green-500' };
}
