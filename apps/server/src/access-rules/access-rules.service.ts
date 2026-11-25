import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AccessRuleType } from '@ownstream/shared';
import { Repository } from 'typeorm';
import { AccessRuleEntity } from '../database/entities';
import { checkRuleSettings } from '../rules/access-rule-settings';
import { CreateAccessRuleDto, UpdateAccessRuleDto } from './dto/access-rule.dto';

export interface AccessRuleView {
  id: string;
  ruleType: AccessRuleType;
  settings: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toAccessRuleView(r: AccessRuleEntity): AccessRuleView {
  return { id: r.id, ruleType: r.ruleType, settings: r.settings, enabled: r.enabled, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/**
 * F10 access rules. The rules engine reads these before every session request, so settings are
 * checked here with the same function the engine uses, and saved in their cleaned-up form.
 */
@Injectable()
export class AccessRulesService {
  constructor(@InjectRepository(AccessRuleEntity) private readonly rules: Repository<AccessRuleEntity>) {}

  async list(userId: string): Promise<AccessRuleView[]> {
    const rows = await this.rules.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return rows.map(toAccessRuleView);
  }

  /** One rule of each type per user; edit the existing one instead of adding a second. */
  async create(userId: string, dto: CreateAccessRuleDto): Promise<AccessRuleView> {
    const existing = await this.rules.findOneBy({ userId, ruleType: dto.ruleType });
    if (existing) throw new ConflictException(`You already have a ${dto.ruleType} rule; edit it instead`);

    const settings = this.checkedSettings(dto.ruleType, dto.settings ?? {});
    const row = this.rules.create({ userId, ruleType: dto.ruleType, settings, enabled: dto.enabled ?? true });
    return toAccessRuleView(await this.rules.save(row));
  }

  async update(userId: string, id: string, dto: UpdateAccessRuleDto): Promise<AccessRuleView> {
    const rule = await this.rules.findOneBy({ id, userId });
    if (!rule) throw this.notFound();
    if (dto.settings !== undefined) rule.settings = this.checkedSettings(rule.ruleType, dto.settings);
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    return toAccessRuleView(await this.rules.save(rule));
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.rules.delete({ id, userId });
    if (!result.affected) throw this.notFound();
  }

  private checkedSettings(type: AccessRuleType, raw: Record<string, unknown>): Record<string, unknown> {
    const checked = checkRuleSettings(type, raw);
    if (!checked.ok) throw new BadRequestException(checked.error);
    return { ...checked.settings };
  }

  /** Another user's rule gives the same 404 as a missing one, so IDs are never confirmed. */
  private notFound(): NotFoundException {
    return new NotFoundException('Access rule not found');
  }
}
