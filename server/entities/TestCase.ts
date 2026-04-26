import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

/**
 * TestCase Entity - 映射 Auto_TestCase 表
 */
@Entity({ name: 'Auto_TestCase' })
export class TestCase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, name: 'case_key', nullable: true, unique: true })
  caseKey: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', name: 'project_id', nullable: true })
  projectId: number | null;

  @Column({ type: 'int', name: 'repo_id', nullable: true })
  repoId: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  module: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  owner: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  source: string | null;

  @Column({ type: 'enum', enum: ['P0', 'P1', 'P2', 'P3'], default: 'P2' })
  priority: 'P0' | 'P1' | 'P2' | 'P3';

  @Column({ type: 'enum', enum: ['api', 'ui', 'performance', 'security'], default: 'api' })
  type: 'api' | 'ui' | 'performance' | 'security';

  @Column({ type: 'varchar', length: 500, name: 'script_path', nullable: true })
  scriptPath: string | null;

  @Column({ type: 'json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'json', nullable: true, name: 'config_json' })
  config: Record<string, unknown> | null;

  @Column({ type: 'boolean', name: 'enabled', default: true })
  enabled: boolean;

  @Column({ type: 'varchar', length: 100, name: 'last_sync_commit', nullable: true })
  lastSyncCommit: string | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @Column({ type: 'int', name: 'updated_by', nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}