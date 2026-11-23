import { LAUNCH_TYPES, LaunchType } from '@ownstream/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeviceEntity } from './device.entity';
import { StreamProfileEntity } from './stream-profile.entity';

@Entity('games')
@Index('games_user_idx', ['userId'])
export class GameEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'host_device_id', type: 'uuid', nullable: true })
  hostDeviceId: string | null;

  @ManyToOne(() => DeviceEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'host_device_id' })
  hostDevice?: DeviceEntity | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'rawg_id', type: 'int', nullable: true })
  rawgId: number | null;

  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  genres: string[];

  /** Postgres date, returned as YYYY-MM-DD. */
  @Column({ type: 'date', nullable: true })
  released: string | null;

  @Column({ type: 'enum', enum: LAUNCH_TYPES, enumName: 'launch_type', default: 'exe' })
  launch: LaunchType;

  @Column({ name: 'launch_target', type: 'text', nullable: true })
  launchTarget: string | null;

  @Column({ name: 'profile_id', type: 'uuid', nullable: true })
  profileId: string | null;

  @ManyToOne(() => StreamProfileEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'profile_id' })
  profile?: StreamProfileEntity | null;

  @Column({ name: 'is_favorite', type: 'boolean', default: false })
  isFavorite: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
