import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Sent by the host app on first run. */
export class CreatePairingCodeDto {
  /** Shown to the user, and used as the device name once paired. */
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  hostName: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  hostOs?: string;
}
