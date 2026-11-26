import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Audited } from '../audit/audited.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessRulesService, AccessRuleView } from './access-rules.service';
import { CreateAccessRuleDto, UpdateAccessRuleDto } from './dto/access-rule.dto';

@Controller('access-rules')
export class AccessRulesController {
  constructor(private readonly rules: AccessRulesService) {}

  @Post()
  @Audited('access_rule.created', 'access_rule')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccessRuleDto): Promise<AccessRuleView> {
    return this.rules.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<AccessRuleView[]> {
    return this.rules.list(user.id);
  }

  @Patch(':id')
  @Audited('access_rule.updated', 'access_rule')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccessRuleDto,
  ): Promise<AccessRuleView> {
    return this.rules.update(user.id, id, dto);
  }

  @Delete(':id')
  @Audited('access_rule.deleted', 'access_rule')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rules.remove(user.id, id);
  }
}
