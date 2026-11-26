import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentTasksModule } from '../agent-tasks/agent-tasks.module';
import { AlertRulesModule } from '../alert-rules/alert-rules.module';
import { DeviceEntity, TelegramLinkCodeEntity } from '../database/entities';
import { DevicesModule } from '../devices/devices.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AlertsService } from './alerts.service';
import { TelegramApi } from './telegram-api.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

/** F9: Telegram linking, the bot webhook and the alert sender. */
@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramLinkCodeEntity, DeviceEntity]),
    AlertRulesModule,
    AgentTasksModule,
    DevicesModule,
    RealtimeModule,
    SessionsModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramApi, TelegramService, AlertsService],
})
export class TelegramModule {}
