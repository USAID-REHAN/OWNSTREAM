import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** A persona is a saved system prompt plus a creativity value (section 12.3). */
export class CreatePersonaDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name: string;

  /** Sent to the model as the system prompt. */
  @Transform(trim)
  @IsString()
  @Length(1, 4000)
  systemPrompt: string;

  /** 0 to 1.5 with one decimal, used as the Ollama temperature (CHECK in the personas table). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1.5)
  creativity?: number;
}
