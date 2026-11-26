import { SESSION_STATUSES, SessionStatus, STREAM_ENGINES, StreamEngine } from '@ownstream/shared';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** POST /api/sessions: ask a paired PC to start a session, with a saved game or just the desktop. */
export class CreateSessionDto {
  @IsUUID()
  hostDeviceId: string;

  @IsOptional()
  @IsUUID()
  gameId?: string;

  /** Defaults to the game's own stream profile. */
  @IsOptional()
  @IsUUID()
  profileId?: string;

  /** Defaults to the profile's engine, then builtin. */
  @IsOptional()
  @IsIn(STREAM_ENGINES)
  engine?: StreamEngine;
}

export const SESSION_ACTIONS = ['end'] as const;
export type SessionAction = (typeof SESSION_ACTIONS)[number];

/** PATCH /api/sessions/:id: end the session, or add a note to it (null clears the note). */
export class UpdateSessionDto {
  @IsOptional()
  @IsIn(SESSION_ACTIONS)
  action?: SessionAction;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** GET /api/sessions filters. */
export class ListSessionsQuery {
  @IsOptional()
  @IsIn(SESSION_STATUSES)
  status?: SessionStatus;

  @IsOptional()
  @IsUUID()
  hostDeviceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
