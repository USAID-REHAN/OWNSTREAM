import { SESSION_STATUSES, STREAM_ENGINES, SessionStatus, StreamEngine } from '@ownstream/shared';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';
import { DeviceEntity } from './device.entity';
import { GameEntity } from './game.entity';
import { StreamProfileEntity } from './stream-profile.entity';

@Entity('stream_sessions')
@Index('stream_sessions_user_idx', ['userId', 'createdAt'])
export class StreamSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'host_device_id', type: 'uuid' })
  hostDeviceId: string;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'host_device_id' })
  hostDevice?: DeviceEntity;

  @Column({ name: 'game_id', type: 'uuid', nullable: true })
  gameId: string | null;

  @ManyToOne(() => GameEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'game_id' })
  game?: GameEntity | null;

  @Column({ name: 'profile_id', type: 'uuid', nullable: true })
  profileId: string | null;

  @ManyToOne(() => StreamProfileEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'profile_id' })
  profile?: StreamProfileEntity | null;

  @Column({ type: 'enum', enum: STREAM_ENGINES, enumName: 'stream_engine', default: 'builtin' })
  engine: StreamEngine;

  @Column({ type: 'enum', enum: SESSION_STATUSES, enumName: 'session_status', default: 'requested' })
  status: SessionStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'avg_fps', type: 'numeric', precision: 5, scale: 1, nullable: true, transformer: numericTransformer })
  avgFps: number | null;

  @Column({ name: 'avg_latency_ms', type: 'int', nullable: true })
  avgLatencyMs: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
