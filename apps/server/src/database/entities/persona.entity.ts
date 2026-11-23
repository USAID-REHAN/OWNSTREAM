import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

@Entity('personas')
@Index('personas_user_idx', ['userId'])
export class PersonaEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt: string;

  /** 0 to 1.5, sent to Ollama as the temperature. */
  @Column({ type: 'numeric', precision: 2, scale: 1, default: 0.7, transformer: numericTransformer })
  creativity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
