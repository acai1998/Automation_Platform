import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

/**
 * TaskExecution Entity - 映射 Auto_TestCaseTaskExecutions 表
 */
@Entity({ name: 'Auto_TestCaseTaskExecutions' })
export class TaskExecution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'run_id', nullable: true })
  runId: number | null;

  @Column({ type: 'int', name: 'task_id', nullable: true })
  taskId: number | null;

  @Column({ type: 'varchar', length: 100, name: 'task_name', nullable: true })
  taskName: string | null;

  @Column({ type: 'enum', enum: ['pending', 'running', 'success', 'failed', 'cancelled'], default: 'pending' })
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

  @Column({ type: 'int', name: 'total_cases', default: 0 })
  totalCases: number;

  @Column({ type: 'int', name: 'passed_cases', default: 0 })
  passedCases: number;

  @Column({ type: 'int', name: 'failed_cases', default: 0 })
  failedCases: number;

  @Column({ type: 'int', name: 'skipped_cases', default: 0 })
  skippedCases: number;

  @Column({ type: 'int', name: 'duration', default: 0 })
  duration: number;

  @Column({ type: 'int', name: 'executed_by' })
  executedBy: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'executed_by' })
  executedByUser: User;

  @Column({ type: 'datetime', name: 'start_time', nullable: true })
  startTime: Date | null;

  @Column({ type: 'datetime', name: 'end_time', nullable: true })
  endTime: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}