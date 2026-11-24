import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationEntity, DeviceEntity, PersonaEntity } from '../database/entities';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

/** F6: conversation metadata, and chat:purge to the host when one is deleted. */
@Module({
  imports: [TypeOrmModule.forFeature([ConversationEntity, DeviceEntity, PersonaEntity]), RealtimeModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
