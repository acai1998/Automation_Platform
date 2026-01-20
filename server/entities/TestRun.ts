import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * TestRun Entity - 映射 Auto_TestRun 表
 */
@Entity({ name: 'Auto_TestRun' })
export class TestRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'project_id', nullable: true })
  projectId: number | null;

  @Column({ type: 'enum', enum: ['manual', 'jenkins', 'schedule'], default: 'manual' })
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  @Column({ type: 'enum', enum: ['manual', 'jenkins', 'schedule'], default: 'manual', name: 'trigger_type' })
  triggerType: 'manual' | 'jenkins' | 'schedule';

  @Column({ type: 'int', name: 'trigger_by' })
  triggerBy: number;

  @Column({ type: 'varchar', length: 255, name: 'jenkins_job', nullable: true })
  jenkinsJob: string | null;

  @Column({ type: 'varchar', length: 255, name: 'jenkins_build_id', nullable: true })
  jenkinsBuildId: string | null;

  @Column({ type: 'varchar', length: 500, name: 'jenkins_url', nullable: true })
  jenkinsUrl: string | null;

  @Column({ type: 'json', name: 'run_config', nullable: true })
  runConfig: Record<string, unknown> | null;

  @Column({ type: 'int', name: 'total_cases', default: 0 })
  totalCases: number;

  @Column({ type: 'int', name: 'passed_cases', default: 0 })
  passedCases: number;

  @Column({ type: 'int', name: 'failed_cases', default: 0 })
  failedCases: number;

  @Column({ type: 'int', name: 'skipped_cases', default: 0 })
  skippedCases: number;

  @Column({ type: 'int', name: 'duration_ms', default: 0 })
  durationMs: number;

  @Column({ type: 'datetime', name: 'start_time', nullable: true })
  startTime: Date | null;

  @Column({ type: 'datetime', name: 'end_time', nullable: true })
  endTime: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}