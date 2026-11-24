import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { DevicesService, DeviceView } from './devices.service';
import { ClaimPairingCodeDto } from './dto/claim-pairing-code.dto';
import { RenameDeviceDto } from './dto/rename-device.dto';
import { PairingClaimed, PairingService } from './pairing.service';

/** Website routes (Supabase login required). */
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly pairing: PairingService,
  ) {}

  /** The user types the code shown on the host. 10 tries per minute to stop guessing. */
  @Post('pair')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pair(@CurrentUser() user: AuthUser, @Body() dto: ClaimPairingCodeDto, @Ip() ip: string): Promise<PairingClaimed> {
    return this.pairing.claim(user.id, dto.code, ip ?? null);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<DeviceView[]> {
    return this.devices.list(user.id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameDeviceDto,
  ): Promise<DeviceView> {
    return this.devices.rename(user.id, id, dto.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unpair(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Ip() ip: string): Promise<void> {
    return this.devices.unpair(user.id, id, ip ?? null);
  }
}
