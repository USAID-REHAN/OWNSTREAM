import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessRuleEntity } from '../database/entities';
import { AccessRulesController } from './access-rules.controller';
import { AccessRulesService } from './access-rules.service';

/** F10: the user's access rules (allowed hours, approval, idle timeout, known networks). */
@Module({
  imports: [TypeOrmModule.forFeature([AccessRuleEntity])],
  controllers: [AccessRulesController],
  providers: [AccessRulesService],
})
export class AccessRulesModule {}
