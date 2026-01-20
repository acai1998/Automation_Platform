import 'reflect-metadata';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * TestRunResult Entity - 映射 Auto_TestRunResults 表
 */
@Entity({ name: 'Auto_TestRunResults' })
export class TestRunResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'execution_id' })
  executionId: number;

  @Column({ type: 'int', name: 'case_id' })
  caseId: number;

  @Column({ type: 'varchar', length: 255, name: 'case_name' })
  caseName: string;

  @Column({ type: 'enum', enum: ['passed', 'failed', 'skipped', 'error'], default: 'error' })
  status: 'passed' | 'failed' | 'skipped' | 'error';

  @Column({ type: 'text', name: 'result', nullable: true })
  result: string | null;

  @Column({ type: 'int', nullable: true })
  duration: number | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'text', name: 'error_stack', nullable: true })
  errorStack: string | null;

  @Column({ type: 'varchar', length: 500, name: 'screenshot_path', nullable: true })
  screenshotPath: string | null;

  @Column({ type: 'varchar', length: 500, name: 'log_path', nullable: true })
  logPath: string | null;

  @Column({ type: 'int', name: 'assertions_total', nullable: true })
  assertionsTotal: number | null;

  @Column({ type: 'int', name: 'assertions_passed', nullable: true })
  assertionsPassed: number | null;

  @Column({ type: 'text', name: 'response_data', nullable: true })
  responseData: string | null;

  @Column({ type: 'datetime', name: 'start_time', nullable: true })
  startTime: Date | null;

  @Column({ type: 'datetime', name: 'end_time', nullable: true })
  endTime: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}