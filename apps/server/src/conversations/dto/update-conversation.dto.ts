import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { MODEL_NAME } from './create-conversation.dto';

/** Rename, change the model, or change or remove (null) the persona. */
export class UpdateConversationDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @Matches(MODEL_NAME, { message: 'model must be an Ollama model name' })
  model?: string;

  /** null removes the persona. */
  @IsOptional()
  @IsUUID()
  personaId?: string | null;
}
