import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationEntity, DeviceEntity } from '../database/entities';
import { DevicesModule } from '../devices/devices.module';
import { HostRegistry } from './host-registry.service';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';
import { RelayService } from './relay.service';

/** Socket.IO gateway: presence, mode changes and the end to end encrypted relay. */
@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity, ConversationEntity]), DevicesModule],
  providers: [RealtimeGateway, HostRegistry, RelayService, PresenceService],
  exports: [HostRegistry],
})
export class RealtimeModule {}
