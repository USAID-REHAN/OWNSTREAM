import { IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  displayName?: string;

  /** An https image address, or null to remove the avatar. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  avatarUrl?: string | null;
}
