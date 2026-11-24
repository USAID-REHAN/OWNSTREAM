import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity, PairingCodeEntity } from '../database/entities';
import { DeviceAuthService } from './device-auth.service';
import { DeviceEvents } from './device-events.service';
import { DeviceTokenService } from './device-token.service';
import { DeviceGuard } from './device.guard';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { HostController } from './host.controller';
import { PairingService } from './pairing.service';

/** F2: pairing, device tokens and the device list. */
@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity, PairingCodeEntity])],
  controllers: [HostController, DevicesController],
  providers: [DeviceTokenService, DeviceAuthService, DeviceGuard, DeviceEvents, PairingService, DevicesService],
  exports: [DeviceTokenService, DeviceAuthService, DeviceGuard, DeviceEvents],
})
export class DevicesModule {}
