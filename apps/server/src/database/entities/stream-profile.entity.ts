import { STREAM_ENGINES, StreamEngine } from '@ownstream/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('stream_profiles')
@Index('stream_profiles_user_idx', ['userId'])
export class StreamProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'int', default: 1920 })
  width: number;

  @Column({ type: 'int', default: 1080 })
  height: number;

  @Column({ name: 'frame_rate', type: 'int', default: 60 })
  frameRate: number;

  @Column({ name: 'bitrate_kbps', type: 'int', default: 12000 })
  bitrateKbps: number;

  @Column({ type: 'enum', enum: STREAM_ENGINES, enumName: 'stream_engine', default: 'builtin' })
  engine: StreamEngine;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
