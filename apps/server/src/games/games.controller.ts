import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateGameDto, ListGamesQuery, SearchGamesQuery, UpdateGameDto } from './dto/game.dto';
import { GamesService, GameView } from './games.service';
import { RawgSearchResult } from './rawg.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  /** Searches RAWG through the server (the API key never reaches the browser). */
  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(@Query() query: SearchGamesQuery): Promise<RawgSearchResult[]> {
    return this.games.search(query.q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGameDto): Promise<GameView> {
    return this.games.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListGamesQuery): Promise<GameView[]> {
    return this.games.list(user.id, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGameDto,
  ): Promise<GameView> {
    return this.games.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.games.remove(user.id, id);
  }
}
