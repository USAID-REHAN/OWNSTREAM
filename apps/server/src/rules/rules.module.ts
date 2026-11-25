import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessRuleEntity } from '../database/entities';
import { RulesEngineService } from './rules-engine.service';

/** F10 rules engine: decides whether a session request may go to the host. */
@Module({
  imports: [TypeOrmModule.forFeature([AccessRuleEntity])],
  providers: [RulesEngineService],
  exports: [RulesEngineService],
})
export class RulesModule {}
