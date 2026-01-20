import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * User Entity - 映射 Auto_Users 表
 */
@Entity({ name: 'Auto_Users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 100, name: 'display_name', nullable: true })
  displayName: string | null;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'locked'], default: 'active' })
  status: 'active' | 'inactive' | 'locked';

  @Column({ type: 'varchar', length: 50, default: 'user' })
  role: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar: string | null;

  @Column({ type: 'int', name: 'login_attempts', default: 0 })
  loginAttempts: number;

  @Column({ type: 'datetime', name: 'locked_until', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'datetime', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'varchar', length: 255, name: 'reset_token', nullable: true })
  resetToken: string | null;

  @Column({ type: 'datetime', name: 'reset_token_expires', nullable: true })
  resetTokenExpires: Date | null;

  @Column({ type: 'varchar', length: 255, name: 'remember_token', nullable: true })
  rememberToken: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}