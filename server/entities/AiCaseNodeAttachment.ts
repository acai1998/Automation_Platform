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
import { AiCaseNodeExecution } from './AiCaseNodeExecution';

/**
 * AiCaseNodeAttachment Entity - maps Auto_AiCaseNodeAttachments
 */
@Entity({ name: 'Auto_AiCaseNodeAttachments' })
export class AiCaseNodeAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'workspace_id' })
  workspaceId: number;

  @ManyToOne(() => AiCaseWorkspace, { nullable: false })
  @JoinColumn({ name: 'workspace_id' })
  workspace: AiCaseWorkspace;

  @Column({ type: 'varchar', length: 64, name: 'node_id' })
  nodeId: string;

  @Column({ type: 'int', name: 'execution_log_id', nullable: true })
  executionLogId: number | null;

  @ManyToOne(() => AiCaseNodeExecution, { nullable: true })
  @JoinColumn({ name: 'execution_log_id' })
  executionLog: AiCaseNodeExecution | null;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName: string;

  @Column({ type: 'varchar', length: 120, name: 'mime_type', nullable: true })
  mimeType: string | null;

  @Column({ type: 'int', name: 'file_size', default: 0 })
  fileSize: number;

  @Column({
    type: 'enum',
    name: 'storage_provider',
    enum: ['local', 'oss', 's3', 'cos', 'minio'],
    default: 'oss',
  })
  storageProvider: 'local' | 'oss' | 's3' | 'cos' | 'minio';

  @Column({ type: 'varchar', length: 120, name: 'storage_bucket', nullable: true })
  storageBucket: string | null;

  @Column({ type: 'varchar', length: 500, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 1000, name: 'access_url', nullable: true })
  accessUrl: string | null;

  @Column({ type: 'varchar', length: 64, name: 'checksum_sha256', nullable: true })
  checksumSha256: string | null;

  @Column({ type: 'int', name: 'uploaded_by', nullable: true })
  uploadedBy: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'boolean', name: 'is_deleted', default: false })
  isDeleted: boolean;

  @Column({ type: 'datetime', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
