import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BlockList, isIP } from 'node:net';
import { Repository } from 'typeorm';
import { AccessRuleEntity } from '../database/entities';
import {
  AllowedHoursSettings,
  checkRuleSettings,
  IdleTimeoutSettings,
  KnownNetworksSettings,
  RequireApprovalSettings,
} from './access-rule-settings';

export interface SessionRequestContext {
  /** When the session was asked for. Defaults to now. */
  now?: Date;
  /** The browser's IP address, as the server saw it. */
  clientIp?: string | null;
}

export interface RulesDecision {
  allowed: boolean;
  /** Why the session was refused, in words the website can show. */
  reason: string | null;
  /** The host must confirm the session on screen first. */
  needsApproval: boolean;
  /** End the session after this many idle minutes, if a rule says so. */
  idleTimeoutMinutes: number | null;
}

type RuleRow = Pick<AccessRuleEntity, 'ruleType' | 'settings'>;

/** "::ffff:203.0.113.7" (IPv4 written as IPv6) becomes "203.0.113.7". */
export function normaliseIp(ip: string): string {
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return v4 ? v4[1] : ip;
}

/** Minutes since midnight in the given time zone. */
export function minutesInZone(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Inside the window? Handles windows that pass midnight, such as 22:00 to 02:00. */
export function insideWindow(minute: number, start: string, end: string): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s < e ? minute >= s && minute < e : minute >= s || minute < e;
}

function onKnownNetwork(ip: string, networks: string[]): boolean {
  const list = new BlockList();
  for (const n of networks) {
    const [addr, prefix] = n.split('/');
    const type = isIP(addr) === 6 ? 'ipv6' : 'ipv4';
    if (prefix === undefined) list.addAddress(addr, type);
    else list.addSubnet(addr, Number(prefix), type);
  }
  const clean = normaliseIp(ip);
  return list.check(clean, isIP(clean) === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Pure rule evaluation, so it is easy to test. Broken settings refuse the session (fail closed),
 * because a rule the user turned on must never be silently skipped.
 */
export function evaluateRules(rules: RuleRow[], context: SessionRequestContext = {}): RulesDecision {
  const now = context.now ?? new Date();
  const decision: RulesDecision = { allowed: true, reason: null, needsApproval: false, idleTimeoutMinutes: null };
  const refuse = (reason: string): RulesDecision => ({ ...decision, allowed: false, reason });

  for (const rule of rules) {
    const checked = checkRuleSettings(rule.ruleType, rule.settings);
    if (!checked.ok) return refuse(`The ${rule.ruleType.replace(/_/g, ' ')} rule has invalid settings; fix it on the rules page`);

    switch (rule.ruleType) {
      case 'allowed_hours': {
        const { start, end, timezone } = checked.settings as AllowedHoursSettings;
        if (!insideWindow(minutesInZone(now, timezone), start, end)) {
          return refuse(`Sessions are allowed only between ${start} and ${end} (${timezone} time)`);
        }
        break;
      }
      case 'block_unknown_network': {
        const { networks } = checked.settings as KnownNetworksSettings;
        if (!context.clientIp || !isIP(normaliseIp(context.clientIp))) return refuse('Your network could not be checked');
        if (!onKnownNetwork(context.clientIp, networks)) return refuse('This network is not on your list of known networks');
        break;
      }
      case 'require_approval':
        if ((checked.settings as RequireApprovalSettings).enabled) decision.needsApproval = true;
        break;
      case 'idle_timeout':
        decision.idleTimeoutMinutes = (checked.settings as IdleTimeoutSettings).minutes;
        break;
    }
  }
  return decision;
}

/**
 * SCRUM-48: checked before every session request (Implementation Plan section 9.3).
 * Reads the user's enabled access rules fresh from the database every time.
 */
@Injectable()
export class RulesEngineService {
  constructor(@InjectRepository(AccessRuleEntity) private readonly rules: Repository<AccessRuleEntity>) {}

  async check(userId: string, context: SessionRequestContext = {}): Promise<RulesDecision> {
    const rows = await this.rules.find({ where: { userId, enabled: true }, select: { ruleType: true, settings: true } });
    return evaluateRules(rows, context);
  }
}
