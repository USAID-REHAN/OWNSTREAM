import type { AccessRuleType } from '@ownstream/shared';
import { isIP } from 'node:net';

/**
 * Settings for each access rule type (stored in access_rules.settings as JSON).
 * Shared by the access rules API, which refuses bad settings, and the rules engine,
 * which refuses a session if stored settings are somehow broken.
 */
export interface AllowedHoursSettings {
  /** "HH:MM", 24 hour clock. */
  start: string;
  end: string;
  /** IANA time zone the times are in. */
  timezone: string;
}
export interface IdleTimeoutSettings {
  minutes: number;
}
export interface RequireApprovalSettings {
  enabled: boolean;
}
export interface KnownNetworksSettings {
  /** IP addresses or CIDR ranges, for example "203.0.113.0/24". */
  networks: string[];
}

export type RuleSettings = AllowedHoursSettings | IdleTimeoutSettings | RequireApprovalSettings | KnownNetworksSettings;
export type SettingsCheck<T = RuleSettings> = { ok: true; settings: T } | { ok: false; error: string };

export const DEFAULT_TIMEZONE = 'Asia/Karachi';
export const IDLE_MINUTES = { min: 5, max: 240 };
export const MAX_NETWORKS = 20;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (error: string): SettingsCheck<never> => ({ ok: false, error });

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "203.0.113.7" or "203.0.113.0/24" or an IPv6 address or range. */
export function isIpOrCidr(value: string): boolean {
  const [ip, prefix, extra] = value.split('/');
  if (extra !== undefined) return false;
  const version = isIP(ip);
  if (!version) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  return bits >= 0 && bits <= (version === 4 ? 32 : 128);
}

/** Checks and normalises the settings for one rule type. Unknown keys are dropped. */
export function checkRuleSettings(type: AccessRuleType, raw: unknown): SettingsCheck {
  const s: Obj = isObj(raw) ? raw : {};
  switch (type) {
    case 'allowed_hours': {
      const { start, end } = s;
      const timezone = s.timezone ?? DEFAULT_TIMEZONE;
      if (typeof start !== 'string' || !HHMM.test(start)) return fail('allowed_hours needs start as "HH:MM", for example "08:00"');
      if (typeof end !== 'string' || !HHMM.test(end)) return fail('allowed_hours needs end as "HH:MM", for example "23:00"');
      if (start === end) return fail('allowed_hours start and end must be different');
      if (typeof timezone !== 'string' || !isValidTimezone(timezone)) return fail('allowed_hours timezone must be a time zone such as "Asia/Karachi"');
      return { ok: true, settings: { start, end, timezone } };
    }
    case 'idle_timeout': {
      const { minutes } = s;
      if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < IDLE_MINUTES.min || minutes > IDLE_MINUTES.max) {
        return fail(`idle_timeout needs minutes, a whole number from ${IDLE_MINUTES.min} to ${IDLE_MINUTES.max}`);
      }
      return { ok: true, settings: { minutes } };
    }
    case 'require_approval': {
      const enabled = s.enabled ?? true;
      if (typeof enabled !== 'boolean') return fail('require_approval enabled must be true or false');
      return { ok: true, settings: { enabled } };
    }
    case 'block_unknown_network': {
      const { networks } = s;
      if (!Array.isArray(networks) || networks.length === 0 || networks.length > MAX_NETWORKS) {
        return fail(`block_unknown_network needs networks, a list of 1 to ${MAX_NETWORKS} IP addresses or ranges`);
      }
      const bad = networks.find((n) => typeof n !== 'string' || !isIpOrCidr(n.trim()));
      if (bad !== undefined) return fail(`"${String(bad)}" is not an IP address or range such as 203.0.113.0/24`);
      return { ok: true, settings: { networks: networks.map((n: string) => n.trim()) } };
    }
  }
}
