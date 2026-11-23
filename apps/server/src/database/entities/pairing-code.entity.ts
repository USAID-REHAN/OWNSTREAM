import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DeviceEntity } from './device.entity';

@Entity('pairing_codes')
export class PairingCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 6, unique: true })
  code: string;

  @Column({ name: 'host_name', type: 'text' })
  hostName: string;

  @Column({ name: 'host_os', type: 'text', nullable: true })
  hostOs: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'claimed_by_user', type: 'uuid', nullable: true })
  claimedByUser: string | null;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'device_id' })
  device?: DeviceEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
