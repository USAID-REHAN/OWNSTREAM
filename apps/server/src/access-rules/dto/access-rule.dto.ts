import { ACCESS_RULE_TYPES, AccessRuleType } from '@ownstream/shared';
import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';

/**
 * Settings depend on the rule type (checked in the service):
 * - allowed_hours: { "start": "08:00", "end": "23:00", "timezone": "Asia/Karachi" }
 * - idle_timeout: { "minutes": 30 }
 * - require_approval: { "enabled": true }
 * - block_unknown_network: { "networks": ["203.0.113.0/24"] }
 */
export class CreateAccessRuleDto {
  @IsIn(ACCESS_RULE_TYPES)
  ruleType: AccessRuleType;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** The rule type cannot change; delete the rule and add a new one instead. */
export class UpdateAccessRuleDto {
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
