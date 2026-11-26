import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { UpdateMeDto } from './dto/update-me.dto';
import { MeResponse, MeService } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.me.getProfile(user);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<MeResponse> {
    return this.me.updateProfile(user, dto);
  }

  /** Deleting an account cannot be undone, so it gets the tightest limit. */
  @Delete()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<void> {
    return this.me.deleteAccount(user, ip ?? null);
  }
}
