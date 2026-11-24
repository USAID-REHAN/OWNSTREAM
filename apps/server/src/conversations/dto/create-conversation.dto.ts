import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Ollama model names such as qwen2.5:3b or llama3.2:1b. */
export const MODEL_NAME = /^[A-Za-z0-9._:/-]{1,60}$/;

/** Only metadata is stored; message text stays on the host (section 12.2). */
export class CreateConversationDto {
  /** The paired host that answers this chat. */
  @IsUUID()
  hostDeviceId: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @Matches(MODEL_NAME, { message: 'model must be an Ollama model name' })
  model?: string;

  @IsOptional()
  @IsUUID()
  personaId?: string;
}
