import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AlertEvent } from '@ownstream/shared';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/db-errors';
import { AlertRuleEntity } from '../database/entities';
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto/alert-rule.dto';

export interface AlertRuleView {
  id: string;
  event: AlertEvent;
  enabled: boolean;
  createdAt: Date;
}

export function toAlertRuleView(r: AlertRuleEntity): AlertRuleView {
  return { id: r.id, event: r.event, enabled: r.enabled, createdAt: r.createdAt };
}

/**
 * F9 alert rules: which events send the user a Telegram alert.
 * The table allows one rule per event per user (unique user_id + event).
 */
@Injectable()
export class AlertRulesService {
  constructor(@InjectRepository(AlertRuleEntity) private readonly rules: Repository<AlertRuleEntity>) {}

  async list(userId: string): Promise<AlertRuleView[]> {
    const rows = await this.rules.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return rows.map(toAlertRuleView);
  }

  async create(userId: string, dto: CreateAlertRuleDto): Promise<AlertRuleView> {
    try {
      const row = await this.rules.save(this.rules.create({ userId, event: dto.event, enabled: dto.enabled ?? true }));
      return toAlertRuleView(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(`You already have a ${dto.event} alert; turn it on or off instead`);
      throw err;
    }
  }

  async update(userId: string, id: string, dto: UpdateAlertRuleDto): Promise<AlertRuleView> {
    const rule = await this.rules.findOneBy({ id, userId });
    if (!rule) throw this.notFound();
    rule.enabled = dto.enabled;
    return toAlertRuleView(await this.rules.save(rule));
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.rules.delete({ id, userId });
    if (!result.affected) throw this.notFound();
  }

  /** Used by the Telegram alert dispatcher: is this alert turned on for the user? */
  async isEnabled(userId: string, event: AlertEvent): Promise<boolean> {
    return this.rules.exists({ where: { userId, event, enabled: true } });
  }

  /** Another user's rule gives the same 404 as a missing one, so IDs are never confirmed. */
  private notFound(): NotFoundException {
    return new NotFoundException('Alert rule not found');
  }
}
