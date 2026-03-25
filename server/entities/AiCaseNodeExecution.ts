import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { AiCaseWorkspace } from './AiCaseWorkspace';

/**
 * AiCaseNodeExecution Entity - maps Auto_AiCaseNodeExecutions
 */
@Entity({ name: 'Auto_AiCaseNodeExecutions' })
export class AiCaseNodeExecution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'workspace_id' })
  workspaceId: number;

  @ManyToOne(() => AiCaseWorkspace, { nullable: false })
  @JoinColumn({ name: 'workspace_id' })
  workspace: AiCaseWorkspace;

  @Column({ type: 'int', name: 'workspace_version', default: 1 })
  workspaceVersion: number;

  @Column({ type: 'varchar', length: 64, name: 'node_id' })
  nodeId: string;

  @Column({ type: 'varchar', length: 255, name: 'node_topic' })
  nodeTopic: string;

  @Column({ type: 'varchar', length: 1000, name: 'node_path', nullable: true })
  nodePath: string | null;

  @Column({
    type: 'enum',
    name: 'previous_status',
    enum: ['todo', 'doing', 'blocked', 'passed', 'failed', 'skipped'],
    nullable: true,
  })
  previousStatus: 'todo' | 'doing' | 'blocked' | 'passed' | 'failed' | 'skipped' | null;

  @Column({
    type: 'enum',
    name: 'current_status',
    enum: ['todo', 'doing', 'blocked', 'passed', 'failed', 'skipped'],
    default: 'todo',
  })
  currentStatus: 'todo' | 'doing' | 'blocked' | 'passed' | 'failed' | 'skipped';

  @Column({ type: 'int', name: 'operator_id', nullable: true })
  operatorId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'operator_id' })
  operator: User | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'longtext', name: 'meta_json', nullable: true })
  metaJson: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
