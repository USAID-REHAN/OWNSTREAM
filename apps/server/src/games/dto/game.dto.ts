import { LAUNCH_TYPES, LaunchType } from '@ownstream/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Add a game. With rawgId, the title, cover, description and genres are copied from RAWG once.
 * Without it (or when RAWG is down), the title is entered by hand.
 */
export class CreateGameDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  rawgId?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  title?: string;

  /** The paired host the game is installed on. */
  @IsOptional()
  @IsUUID()
  hostDeviceId?: string;

  @IsOptional()
  @IsIn(LAUNCH_TYPES)
  launch?: LaunchType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  launchTarget?: string;

  /** Stream profile to use for this game. */
  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Edit launch details, notes and favourite. null clears an optional field. */
export class UpdateGameDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsUUID()
  hostDeviceId?: string | null;

  @IsOptional()
  @IsIn(LAUNCH_TYPES)
  launch?: LaunchType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  launchTarget?: string | null;

  @IsOptional()
  @IsUUID()
  profileId?: string | null;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/** GET /api/games filters. */
export class ListGamesQuery {
  /** Part of the title. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  genre?: string;

  @IsOptional()
  @IsUUID()
  hostDeviceId?: string;
}

/** GET /api/games/search?q= */
export class SearchGamesQuery {
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  q: string;
}
