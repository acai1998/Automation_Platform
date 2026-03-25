import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';

/**
 * AiCaseWorkspace Entity - maps Auto_AiCaseWorkspaces
 */
@Entity({ name: 'Auto_AiCaseWorkspaces' })
export class AiCaseWorkspace {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, name: 'workspace_key', unique: true })
  workspaceKey: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'int', name: 'project_id', nullable: true })
  projectId: number | null;

  @Column({ type: 'longtext', name: 'requirement_text', nullable: true })
  requirementText: string | null;

  @Column({ type: 'longtext', name: 'map_data' })
  mapData: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  })
  status: 'draft' | 'published' | 'archived';

  @Column({
    type: 'enum',
    name: 'sync_source',
    enum: ['local_import', 'remote_direct', 'mixed'],
    default: 'remote_direct',
  })
  syncSource: 'local_import' | 'remote_direct' | 'mixed';

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'int', name: 'total_cases', default: 0 })
  totalCases: number;

  @Column({ type: 'int', name: 'todo_cases', default: 0 })
  todoCases: number;

  @Column({ type: 'int', name: 'doing_cases', default: 0 })
  doingCases: number;

  @Column({ type: 'int', name: 'blocked_cases', default: 0 })
  blockedCases: number;

  @Column({ type: 'int', name: 'passed_cases', default: 0 })
  passedCases: number;

  @Column({ type: 'int', name: 'failed_cases', default: 0 })
  failedCases: number;

  @Column({ type: 'int', name: 'skipped_cases', default: 0 })
  skippedCases: number;

  @Column({ type: 'datetime', name: 'last_synced_at', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @Column({ type: 'int', name: 'updated_by', nullable: true })
  updatedBy: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updater: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
