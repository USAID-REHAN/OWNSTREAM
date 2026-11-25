import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertRuleEntity } from '../database/entities';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';

/** F9: which events send a Telegram alert. */
@Module({
  imports: [TypeOrmModule.forFeature([AlertRuleEntity])],
  controllers: [AlertRulesController],
  providers: [AlertRulesService],
  exports: [AlertRulesService],
})
export class AlertRulesModule {}
