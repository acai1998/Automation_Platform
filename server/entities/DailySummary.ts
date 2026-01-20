import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * DailySummary Entity - 映射 Auto_TestCaseDailySummaries 表
 */
@Entity({ name: 'Auto_TestCaseDailySummaries' })
export class DailySummary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date', name: 'summary_date', unique: true })
  summaryDate: string;

  @Column({ type: 'int', name: 'total_executions', default: 0 })
  totalExecutions: number;

  @Column({ type: 'int', name: 'total_cases_run', default: 0 })
  totalCasesRun: number;

  @Column({ type: 'int', name: 'passed_cases', default: 0 })
  passedCases: number;

  @Column({ type: 'int', name: 'failed_cases', default: 0 })
  failedCases: number;

  @Column({ type: 'int', name: 'skipped_cases', default: 0 })
  skippedCases: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'success_rate', default: 0 })
  successRate: number;

  @Column({ type: 'int', name: 'avg_duration', default: 0 })
  avgDuration: number;

  @Column({ type: 'int', name: 'active_cases_count', default: 0 })
  activeCasesCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'datetime', name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}