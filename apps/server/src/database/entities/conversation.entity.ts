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
import { PersonaEntity } from './persona.entity';

/** Conversation metadata only. Message text stays on the home PC. */
@Entity('conversations')
@Index('conversations_user_idx', ['userId', 'updatedAt'])
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'host_device_id', type: 'uuid', nullable: true })
  hostDeviceId: string | null;

  @ManyToOne(() => DeviceEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'host_device_id' })
  hostDevice?: DeviceEntity | null;

  @Column({ name: 'persona_id', type: 'uuid', nullable: true })
  personaId: string | null;

  @ManyToOne(() => PersonaEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'persona_id' })
  persona?: PersonaEntity | null;

  @Column({ type: 'text', default: 'New chat' })
  title: string;

  @Column({ type: 'text' })
  model: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
