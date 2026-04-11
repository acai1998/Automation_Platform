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

  /**
   * 需求文本的向量表示（JSON 编码的 float[]）
   * 用于知识库语义检索，由 EmbeddingService 生成
   * 格式：JSON 序列化的数字数组，如 "[0.123, -0.456, ...]"
   */
  @Column({ type: 'longtext', name: 'requirement_embedding', nullable: true })
  requirementEmbedding: string | null;

  /**
   * 是否加入知识库（0 = 否，1 = 是）
   * 用户可手动标记优质用例集加入知识库，供后续 AI 生成参考
   */
  @Column({ type: 'tinyint', name: 'is_knowledge_base', default: 0 })
  isKnowledgeBase: number;

  /**
   * 用例质量评分（0-100）
   * 0 = 未评分，1-100 = 人工或自动评分
   * 检索时优先返回高分用例
   */
  @Column({ type: 'int', name: 'quality_score', default: 0 })
  qualityScore: number;

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
