import { STREAM_ENGINES, StreamEngine } from '@ownstream/shared';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/** Every field is optional; only the fields sent are changed. */
export class UpdateStreamProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(640)
  @Max(3840)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(360)
  @Max(2160)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  frameRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  bitrateKbps?: number;

  @IsOptional()
  @IsIn(STREAM_ENGINES)
  engine?: StreamEngine;
}
