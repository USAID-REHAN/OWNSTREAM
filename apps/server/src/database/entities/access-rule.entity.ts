import { ACCESS_RULE_TYPES, AccessRuleType } from '@ownstream/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('access_rules')
@Index('access_rules_user_idx', ['userId'])
export class AccessRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'rule_type', type: 'enum', enum: ACCESS_RULE_TYPES, enumName: 'access_rule_type' })
  ruleType: AccessRuleType;

  /** For example {"start":"08:00","end":"23:00"} for allowed_hours or {"minutes":30} for idle_timeout. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
