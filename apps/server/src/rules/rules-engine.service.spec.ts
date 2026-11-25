import { Repository } from 'typeorm';
import { AccessRuleEntity } from '../database/entities';
import { checkRuleSettings, isIpOrCidr } from './access-rule-settings';
import { evaluateRules, insideWindow, minutesInZone, normaliseIp, RulesEngineService } from './rules-engine.service';

// 10:30 in Karachi (UTC+5) is 05:30 UTC.
const KARACHI_1030 = new Date('2026-11-25T05:30:00Z');
const KARACHI_2330 = new Date('2026-11-25T18:30:00Z');

describe('access rule settings', () => {
  it('normalises allowed hours and defaults the time zone to Karachi', () => {
    expect(checkRuleSettings('allowed_hours', { start: '08:00', end: '23:00', extra: 1 })).toEqual({
      ok: true,
      settings: { start: '08:00', end: '23:00', timezone: 'Asia/Karachi' },
    });
  });

  it.each([
    ['allowed_hours', { start: '8:00', end: '23:00' }],
    ['allowed_hours', { start: '08:00', end: '08:00' }],
    ['allowed_hours', { start: '08:00', end: '24:00' }],
    ['allowed_hours', { start: '08:00', end: '23:00', timezone: 'Mars/Base' }],
    ['idle_timeout', { minutes: 2 }],
    ['idle_timeout', { minutes: 30.5 }],
    ['require_approval', { enabled: 'yes' }],
    ['block_unknown_network', { networks: [] }],
    ['block_unknown_network', { networks: ['my home'] }],
    ['block_unknown_network', { networks: ['10.0.0.0/33'] }],
  ] as const)('refuses bad %s settings %j', (type, settings) => {
    expect(checkRuleSettings(type, settings).ok).toBe(false);
  });

  it('accepts IPv4 and IPv6 addresses and ranges', () => {
    expect(['203.0.113.7', '203.0.113.0/24', '2001:db8::1', '2001:db8::/32'].every(isIpOrCidr)).toBe(true);
    expect(['203.0.113.0/', '1.2.3', '2001:db8::/129', '1.2.3.4/24/1'].some(isIpOrCidr)).toBe(false);
  });
});

describe('rules engine', () => {
  it('allows a session when the user has no rules', () => {
    expect(evaluateRules([])).toEqual({ allowed: true, reason: null, needsApproval: false, idleTimeoutMinutes: null });
  });

  it('works out the time in the rule time zone, including windows past midnight', () => {
    expect(minutesInZone(KARACHI_1030, 'Asia/Karachi')).toBe(10 * 60 + 30);
    expect(insideWindow(10 * 60, '08:00', '23:00')).toBe(true);
    expect(insideWindow(23 * 60, '08:00', '23:00')).toBe(false);
    expect(insideWindow(1 * 60, '22:00', '02:00')).toBe(true);
    expect(insideWindow(12 * 60, '22:00', '02:00')).toBe(false);
  });

  it('refuses a session outside the allowed hours with a clear message (test T15)', () => {
    const rules = [{ ruleType: 'allowed_hours' as const, settings: { start: '08:00', end: '23:00' } }];

    expect(evaluateRules(rules, { now: KARACHI_1030 }).allowed).toBe(true);
    expect(evaluateRules(rules, { now: KARACHI_2330 })).toMatchObject({
      allowed: false,
      reason: 'Sessions are allowed only between 08:00 and 23:00 (Asia/Karachi time)',
    });
  });

  it('only allows known networks when that rule is on', () => {
    const rules = [{ ruleType: 'block_unknown_network' as const, settings: { networks: ['203.0.113.0/24', '2001:db8::/32'] } }];

    expect(evaluateRules(rules, { clientIp: '203.0.113.50' }).allowed).toBe(true);
    expect(evaluateRules(rules, { clientIp: '::ffff:203.0.113.50' }).allowed).toBe(true);
    expect(evaluateRules(rules, { clientIp: '2001:db8::7' }).allowed).toBe(true);
    expect(evaluateRules(rules, { clientIp: '198.51.100.9' })).toMatchObject({ allowed: false, reason: 'This network is not on your list of known networks' });
    expect(evaluateRules(rules, { clientIp: null }).allowed).toBe(false);
  });

  it('reports approval and idle timeout without refusing', () => {
    const decision = evaluateRules([
      { ruleType: 'require_approval', settings: { enabled: true } },
      { ruleType: 'idle_timeout', settings: { minutes: 30 } },
    ]);

    expect(decision).toEqual({ allowed: true, reason: null, needsApproval: true, idleTimeoutMinutes: 30 });
    expect(evaluateRules([{ ruleType: 'require_approval', settings: { enabled: false } }]).needsApproval).toBe(false);
  });

  it('refuses the session if a stored rule is broken, instead of skipping it', () => {
    expect(evaluateRules([{ ruleType: 'allowed_hours', settings: { start: 'morning' } }])).toMatchObject({
      allowed: false,
      reason: 'The allowed hours rule has invalid settings; fix it on the rules page',
    });
  });

  it('normalises IPv4 addresses written as IPv6', () => {
    expect(normaliseIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(normaliseIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('reads only the user’s enabled rules from the database', async () => {
    const find = jest.fn(async () => [{ ruleType: 'idle_timeout', settings: { minutes: 15 } }]);
    const engine = new RulesEngineService({ find } as unknown as Repository<AccessRuleEntity>);

    await expect(engine.check('user-1')).resolves.toMatchObject({ allowed: true, idleTimeoutMinutes: 15 });
    expect(find).toHaveBeenCalledWith({ where: { userId: 'user-1', enabled: true }, select: { ruleType: true, settings: true } });
  });
});
