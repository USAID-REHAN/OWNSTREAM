import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Audited } from '../audit/audited.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateSessionDto, ListSessionsQuery, UpdateSessionDto } from './dto/session.dto';
import { SessionsService, SessionView } from './sessions.service';

/** F5 sessions: ask the home PC for a session, end it, and the history. */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** Each request may launch a program on the home PC, so it has its own tighter limit. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Audited('session.requested', 'stream_session')
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto, @Ip() ip: string): Promise<SessionView> {
    return this.sessions.request(user.id, dto, ip ?? null);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListSessionsQuery): Promise<SessionView[]> {
    return this.sessions.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<SessionView> {
    return this.sessions.get(user.id, id);
  }

  /** { "action": "end" } ends the session; { "note": "..." } adds a note. */
  @Patch(':id')
  @Audited('session.updated', 'stream_session')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<SessionView> {
    return this.sessions.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited('session.deleted', 'stream_session')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sessions.remove(user.id, id);
  }
}
