import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRepository } from '../repositories/UserRepository.js';
import { AppDataSource } from '../config/database.js';
import { User } from '../entities/User.js';
import { sendPasswordResetEmail } from './EmailService.js';

// JWT 密钥配置
const JWT_SECRET = process.env.JWT_SECRET || 'autotest-jwt-secret-key-2025';
const JWT_EXPIRES_IN = '7d';
const JWT_REFRESH_EXPIRES_IN = '30d';

// 返回给前端的用户信息（不包含敏感数据）
export interface UserInfo {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  avatar: string | null;
  role: string;
  status: string;
}

// 登录响应
export interface LoginResponse {
  success: boolean;
  message: string;
  user?: UserInfo;
  token?: string;
  refreshToken?: string;
}

// 注册响应
export interface RegisterResponse {
  success: boolean;
  message: string;
  user?: UserInfo;
}

export class AuthService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository(AppDataSource);
  }

  // 密码加密
  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  // 验证密码
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // 生成 JWT Token
  private generateToken(user: User): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  // 生成刷新 Token
  private generateRefreshToken(user: User): string {
    return jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
  }

  // 验证 Token
  verifyToken(token: string): { id: number; email: string; role: string } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
      return decoded;
    } catch {
      return null;
    }
  }

  // 将 User 转换为 UserInfo
  private toUserInfo(user: User): UserInfo {
    return {
      id: user.id,
      username: user.username,
      email: user.email || '',
      display_name: user.displayName,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
    };
  }

  // 用户注册
  async register(email: string, password: string, username: string): Promise<RegisterResponse> {
    try {
      // 检查邮箱是否已存在
      const existingEmail = await this.userRepository.findByEmail(email);
      if (existingEmail) {
        return { success: false, message: '该邮箱已被注册' };
      }

      // 检查用户名是否已存在
      const existingUsername = await this.userRepository.findByUsername(username);
      if (existingUsername) {
        return { success: false, message: '该用户名已被使用' };
      }

      // 加密密码
      const passwordHash = await this.hashPassword(password);

      // 创建新用户
      const user = await this.userRepository.createUser({
        username,
        email,
        passwordHash,
        displayName: username,
      });

      return {
        success: true,
        message: '注册成功',
        user: this.toUserInfo(user),
      };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, message: '注册失败，请稍后重试' };
    }
  }

  // 用户登录
  async login(email: string, password: string, remember = false): Promise<LoginResponse> {
    try {
      // 查找用户
      const user = await this.userRepository.findByEmail(email);

      if (!user) {
        return { success: false, message: '用户不存在' };
      }

      // 检查账户是否被锁定
      if (user.status === 'locked') {
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          return { success: false, message: '账户已被锁定，请稍后重试' };
        }
        // 锁定时间已过，解锁账户
        await this.userRepository.unlockUser(user.id);
      }

      // 验证密码
      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        // 增加登录失败次数
        const newAttempts = user.loginAttempts + 1;
        if (newAttempts >= 5) {
          // 锁定账户 15 分钟
          const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          await this.userRepository.lockUser(user.id, lockedUntil);
          await this.userRepository.updateLoginAttempts(user.id, newAttempts);
          return { success: false, message: '登录失败次数过多，账户已被锁定 15 分钟' };
        }
        await this.userRepository.updateLoginAttempts(user.id, newAttempts);
        return { success: false, message: '密码错误' };
      }

      // 登录成功，重置登录失败次数
      await this.userRepository.updateLastLogin(user.id);

      // 生成 Token
      const token = this.generateToken(user);
      const refreshToken = remember ? this.generateRefreshToken(user) : undefined;

      // 如果选择记住登录，保存 remember_token
      if (remember && refreshToken) {
        await this.userRepository.setRememberToken(user.id, refreshToken);
      }

      return {
        success: true,
        message: '登录成功',
        user: this.toUserInfo(user),
        token,
        refreshToken,
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: '登录失败，请稍后重试' };
    }
  }

  // 登出
  async logout(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      await this.userRepository.setRememberToken(userId, null);
      return { success: true, message: '登出成功' };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, message: '登出失败' };
    }
  }

  // 忘记密码 - 发送重置邮件
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await this.userRepository.findByEmail(email);

      if (!user) {
        // 为了安全，不透露用户是否存在
        return { success: true, message: '如果该邮箱已注册，您将收到一封密码重置邮件' };
      }

      // 生成重置 Token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 小时后过期

      await this.userRepository.setResetToken(user.id, resetToken, resetTokenExpires);

      // 发送重置邮件
      await sendPasswordResetEmail(email, resetToken, user.username);

      return { success: true, message: '如果该邮箱已注册，您将收到一封密码重置邮件' };
    } catch (error) {
      console.error('Forgot password error:', error);
      return { success: false, message: '发送重置邮件失败，请稍后重试' };
    }
  }

  // 重置密码
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await this.userRepository.findByResetToken(token);

      if (!user) {
        return { success: false, message: '重置链接无效或已过期' };
      }

      // 加密新密码
      const passwordHash = await this.hashPassword(newPassword);

      // 更新密码并清除重置 Token
      await this.userRepository.resetPassword(user.id, passwordHash);

      return { success: true, message: '密码重置成功' };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, message: '密码重置失败，请稍后重试' };
    }
  }

  // 获取当前用户信息
  async getCurrentUser(userId: number): Promise<UserInfo | null> {
    try {
      const user = await this.userRepository.findById(userId);
      return user ? this.toUserInfo(user) : null;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  // 刷新 Token
  async refreshToken(refreshToken: string): Promise<{ token?: string; message: string }> {
    try {
      const decoded = this.verifyToken(refreshToken);
      if (!decoded) {
        return { message: 'Token 无效或已过期' };
      }

      const user = await this.userRepository.findByRememberToken(refreshToken);

      if (!user) {
        return { message: 'Token 无效' };
      }

      const newToken = this.generateToken(user);
      return { token: newToken, message: '刷新成功' };
    } catch (error) {
      console.error('Refresh token error:', error);
      return { message: 'Token 刷新失败' };
    }
  }
}

export const authService = new AuthService();
export default authService;
