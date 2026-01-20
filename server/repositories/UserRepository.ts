import { DataSource, QueryRunner } from 'typeorm';
import { User } from '../entities/User';
import { BaseRepository } from './BaseRepository';

/**
 * 用户 Repository
 */
export class UserRepository extends BaseRepository<User> {
  constructor(dataSource: DataSource) {
    super(dataSource, User);
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  /**
   * 根据用户名查找用户
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.repository.findOne({ where: { username } });
  }

  /**
   * 根据 ID 查找用户
   */
  async findById(id: number): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * 根据重置 Token 查找用户
   */
  async findByResetToken(token: string): Promise<User | null> {
    return this.repository.createQueryBuilder('user')
      .where('user.resetToken = :token', { token })
      .andWhere('user.resetTokenExpires > NOW()')
      .getOne();
  }

  /**
   * 根据记住 Token 查找用户
   */
  async findByRememberToken(refreshToken: string): Promise<User | null> {
    return this.repository.findOne({ 
      where: { rememberToken: refreshToken } 
    });
  }

  /**
   * 创建新用户
   */
  async createUser(userData: {
    username: string;
    email: string;
    passwordHash: string;
    displayName?: string;
  }): Promise<User> {
    const user = this.repository.create({
      ...userData,
      status: 'active',
      loginAttempts: 0,
    });
    return this.repository.save(user);
  }

  /**
   * 更新用户登录失败次数
   */
  async updateLoginAttempts(userId: number, attempts: number): Promise<void> {
    await this.repository.update(userId, { loginAttempts: attempts });
  }

  /**
   * 锁定用户账户
   */
  async lockUser(userId: number, lockedUntil: Date): Promise<void> {
    await this.repository.update(userId, {
      status: 'locked',
      lockedUntil,
      loginAttempts: 0,
    });
  }

  /**
   * 解锁用户账户
   */
  async unlockUser(userId: number): Promise<void> {
    await this.repository.update(userId, {
      status: 'active',
      loginAttempts: 0,
      lockedUntil: null,
    });
  }

  /**
   * 更新最后登录时间
   */
  async updateLastLogin(userId: number): Promise<void> {
    await this.repository.update(userId, {
      lastLoginAt: new Date(),
      loginAttempts: 0,
    });
  }

  /**
   * 设置重置密码 Token
   */
  async setResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    await this.repository.update(userId, {
      resetToken: token,
      resetTokenExpires: expiresAt,
    });
  }

  /**
   * 重置密码
   */
  async resetPassword(userId: number, passwordHash: string): Promise<void> {
    await this.repository.update(userId, {
      passwordHash,
      resetToken: null,
      resetTokenExpires: null,
    });
  }

  /**
   * 设置记住 Token
   */
  async setRememberToken(userId: number, token: string | null): Promise<void> {
    await this.repository.update(userId, {
      rememberToken: token,
    });
  }
}