import { Body, Controller, Get, Headers, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import type { DeviceEntity } from '../database/entities';
import { CurrentDevice } from './current-device.decorator';
import { DeviceGuard } from './device.guard';
import { DeviceView, toDeviceView } from './devices.service';
import { CreatePairingCodeDto } from './dto/create-pairing-code.dto';
import { PairingCodeCreated, PairingService, PairingStatus } from './pairing.service';

/** Routes the host app calls. No Supabase login: before pairing it has none, after pairing it uses its device token. */
@Public()
@Controller('host')
export class HostController {
  constructor(private readonly pairing: PairingService) {}

  /** First run: the host asks for a six digit code. Limited per IP address. */
  @Post('pairing-code')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createCode(@Body() dto: CreatePairingCodeDto): Promise<PairingCodeCreated> {
    return this.pairing.createCode(dto);
  }

  /** The host polls every 6 seconds; once claimed, the device token is returned exactly once. */
  @Get('pairing-status/:code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  status(
    @Param('code') code: string,
    @Headers('x-pairing-secret') pairingSecret: string | undefined,
    @Ip() ip: string,
  ): Promise<PairingStatus> {
    return this.pairing.status(code, pairingSecret, ip ?? null);
  }

  /** Lets the host check that its saved token still works (it stops working when unpaired). */
  @Get('device')
  @UseGuards(DeviceGuard)
  device(@CurrentDevice() device: DeviceEntity): DeviceView {
    return toDeviceView(device);
  }
}
