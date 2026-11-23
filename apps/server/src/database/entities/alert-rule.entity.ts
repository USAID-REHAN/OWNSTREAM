import { ALERT_EVENTS, AlertEvent } from '@ownstream/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('alert_rules')
@Unique(['userId', 'event'])
export class AlertRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ALERT_EVENTS, enumName: 'alert_event' })
  event: AlertEvent;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
