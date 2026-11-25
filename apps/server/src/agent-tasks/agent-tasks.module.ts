import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentTaskEntity, DeviceEntity } from '../database/entities';
import { DevicesModule } from '../devices/devices.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AgentTasksController } from './agent-tasks.controller';
import { AgentTasksGateway } from './agent-tasks.gateway';
import { AgentTasksService } from './agent-tasks.service';

/** F8: agent tasks, their status flow and the approval flow. */
@Module({
  imports: [TypeOrmModule.forFeature([AgentTaskEntity, DeviceEntity]), DevicesModule, RealtimeModule],
  controllers: [AgentTasksController],
  providers: [AgentTasksService, AgentTasksGateway],
  exports: [AgentTasksService],
})
export class AgentTasksModule {}
