import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Audited } from '../audit/audited.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AlertRulesService, AlertRuleView } from './alert-rules.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto/alert-rule.dto';

@Controller('alert-rules')
export class AlertRulesController {
  constructor(private readonly rules: AlertRulesService) {}

  @Post()
  @Audited('alert_rule.created', 'alert_rule')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAlertRuleDto): Promise<AlertRuleView> {
    return this.rules.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<AlertRuleView[]> {
    return this.rules.list(user.id);
  }

  /** Turn an alert on or off. */
  @Patch(':id')
  @Audited('alert_rule.updated', 'alert_rule')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRuleDto,
  ): Promise<AlertRuleView> {
    return this.rules.update(user.id, id, dto);
  }

  @Delete(':id')
  @Audited('alert_rule.deleted', 'alert_rule')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rules.remove(user.id, id);
  }
}
