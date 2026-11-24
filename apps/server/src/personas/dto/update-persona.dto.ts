import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { trim } from './create-persona.dto';

/** Every field is optional; only the fields sent are changed. */
export class UpdatePersonaDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 4000)
  systemPrompt?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1.5)
  creativity?: number;
}
