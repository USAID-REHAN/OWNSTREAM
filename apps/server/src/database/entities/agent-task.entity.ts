import { TASK_STATUSES, TaskStatus } from '@ownstream/shared';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DeviceEntity } from './device.entity';

@Entity('agent_tasks')
@Index('agent_tasks_user_idx', ['userId', 'createdAt'])
export class AgentTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'host_device_id', type: 'uuid' })
  hostDeviceId: string;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'host_device_id' })
  hostDevice?: DeviceEntity;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  instruction: string;

  @Column({ name: 'allowed_tools', type: 'text', array: true, default: () => "'{read_file}'" })
  allowedTools: string[];

  @Column({ name: 'workspace_folder', type: 'text' })
  workspaceFolder: string;

  @Column({ type: 'enum', enum: TASK_STATUSES, enumName: 'task_status', default: 'queued' })
  status: TaskStatus;

  @Column({ name: 'result_summary', type: 'text', nullable: true })
  resultSummary: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
