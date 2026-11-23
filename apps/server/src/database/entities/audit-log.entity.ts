import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_log')
@Index('audit_log_user_idx', ['userId', 'createdAt'])
export class AuditLogEntity {
  /** bigint identity; Postgres returns bigint as a string. */
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text', nullable: true })
  entity: string | null;

  @Column({ name: 'entity_id', type: 'text', nullable: true })
  entityId: string | null;

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
