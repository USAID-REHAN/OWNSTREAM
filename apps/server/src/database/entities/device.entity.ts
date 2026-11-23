import { APP_MODES, AppMode, DEVICE_ROLES, DeviceRole } from '@ownstream/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('devices')
@Index('devices_user_idx', ['userId'])
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'enum', enum: DEVICE_ROLES, enumName: 'device_role', default: 'host' })
  role: DeviceRole;

  @Column({ name: 'token_hash', type: 'text', nullable: true })
  tokenHash: string | null;

  @Column({ type: 'text', nullable: true })
  os: string | null;

  @Column({ name: 'is_online', type: 'boolean', default: false })
  isOnline: boolean;

  @Column({ name: 'current_mode', type: 'enum', enum: APP_MODES, enumName: 'app_mode', default: 'ai' })
  currentMode: AppMode;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
