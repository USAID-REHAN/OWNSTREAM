import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity, GameEntity, StreamProfileEntity, StreamSessionEntity } from '../database/entities';
import { DevicesModule } from '../devices/devices.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RulesModule } from '../rules/rules.module';
import { SessionsController } from './sessions.controller';
import { SessionsGateway } from './sessions.gateway';
import { SessionsService } from './sessions.service';

/** F5: session requests, the access rules check, host approval, game launch, end and history. */
@Module({
  imports: [
    TypeOrmModule.forFeature([StreamSessionEntity, DeviceEntity, GameEntity, StreamProfileEntity]),
    DevicesModule,
    RealtimeModule,
    RulesModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsGateway],
  exports: [SessionsService],
})
export class SessionsModule {}
