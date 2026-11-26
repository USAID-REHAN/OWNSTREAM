import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AgentTasksService } from '../agent-tasks/agent-tasks.service';
import { AlertRulesService } from '../alert-rules/alert-rules.service';
import { AuditService } from '../audit/audit.service';
import { EnvironmentVariables } from '../config/env.validation';
import { DeviceEntity, TelegramLinkCodeEntity } from '../database/entities';
import { DeviceEvents } from '../devices/device-events.service';
import { HostRegistry } from '../realtime/host-registry.service';
import { SessionsService, SessionView } from '../sessions/sessions.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AlertsService, formatLength, sessionAlert, taskAlert } from './alerts.service';
import { TelegramApi } from './telegram-api.service';
import { HELP_TEXT, LINK_CODE_TTL_MS, MAX_WRONG_CODES, parseCommand, secretMatches, TelegramService } from './telegram.service';

type Row = Record<string, unknown>;

/** Enough of the Supabase query builder for the profiles calls the service makes. */
function fakeSupabase(rows: Row[]) {
  const from = () => {
    let update: Row | null = null;
    const filters: Array<(r: Row) => boolean> = [];
    const builder = {
      select: () => builder,
      update: (values: Row) => ((update = values), builder),
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), builder),
      neq: (col: string, v: unknown) => (filters.push((r) => r[col] !== v), builder),
      maybeSingle: async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
      then: (resolve: (v: { error: null }) => void) => {
        if (update) rows.filter((r) => filters.every((f) => f(r))).forEach((r) => Object.assign(r, update));
        resolve({ error: null });
      },
    };
    return builder;
  };
  return { admin: { from } } as unknown as SupabaseService;
}

/** telegram_link_codes in memory, including the "use once" update. */
function fakeCodes() {
  const rows: Array<{ userId: string; code: string; expiresAt: Date; usedAt: Date | null }> = [];
  return {
    rows,
    delete: jest.fn(async ({ userId }: { userId: string }) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].userId === userId && !rows[i].usedAt) rows.splice(i, 1);
    }),
    insert: jest.fn(async (r: { userId: string; code: string; expiresAt: Date }) => void rows.push({ ...r, usedAt: null })),
    createQueryBuilder: () => {
      let params: { code: string; now: Date } = { code: '', now: new Date() };
      const qb = {
        update: () => qb,
        set: () => qb,
        where: (_: string, p: typeof params) => ((params = p), qb),
        returning: () => qb,
        execute: async () => {
          const row = rows.find((r) => r.code === params.code && !r.usedAt && r.expiresAt > params.now);
          if (row) row.usedAt = params.now;
          return { raw: row ? [{ user_id: row.userId }] : [] };
        },
      };
      return qb;
    },
  };
}

const configWith = (values: Partial<Record<keyof EnvironmentVariables, string>>) =>
  ({ get: (key: keyof EnvironmentVariables) => values[key] }) as unknown as ConfigService<EnvironmentVariables, true>;

describe('TelegramService', () => {
  const HOST = '11111111-1111-4111-8111-111111111111';
  let profiles: Row[];
  let codes: ReturnType<typeof fakeCodes>;
  let api: { enabled: boolean; botUsername: jest.Mock; sendMessage: jest.Mock };
  let registry: HostRegistry;
  let sessions: { openFor: jest.Mock; endAllFor: jest.Mock };
  let audit: { log: jest.Mock };
  let service: TelegramService;

  const update = (text: string, chatId = 777, type = 'private') => ({ update_id: 1, message: { text, chat: { id: chatId, type } } });
  const say = async (text: string, chatId = 777, now = Date.now()) => (await service.handleUpdate(update(text, chatId), now))?.text;

  beforeEach(() => {
    profiles = [
      { id: 'user-1', telegram_chat_id: null },
      { id: 'user-2', telegram_chat_id: null },
    ];
    codes = fakeCodes();
    api = { enabled: true, botUsername: jest.fn(async () => 'OwnstreamBot'), sendMessage: jest.fn(async () => true) };
    registry = new HostRegistry();
    sessions = { openFor: jest.fn(async () => []), endAllFor: jest.fn(async () => 1) };
    audit = { log: jest.fn(async () => undefined) };
    const devices = {
      find: jest.fn(async ({ where }: { where: Row }) =>
        where.userId === 'user-1' ? [{ id: HOST, name: 'Desk PC', lastSeenAt: new Date(Date.now() - 5 * 60_000) }] : [],
      ),
    };
    service = new TelegramService(
      codes as unknown as Repository<TelegramLinkCodeEntity>,
      devices as unknown as Repository<DeviceEntity>,
      fakeSupabase(profiles),
      api as unknown as TelegramApi,
      registry,
      sessions as unknown as SessionsService,
      audit as unknown as AuditService,
      configWith({ TELEGRAM_WEBHOOK_SECRET: 'the-webhook-secret' }),
    );
  });

  it('makes a 6 digit code for 10 minutes, with a link to the bot, replacing an unused one', async () => {
    await service.createLinkCode('user-1');
    const view = await service.createLinkCode('user-1');

    expect(view.code).toMatch(/^\d{6}$/);
    expect(view.expiresAt.getTime() - Date.now()).toBeGreaterThan(LINK_CODE_TTL_MS - 1000);
    expect(view.link).toBe(`https://t.me/OwnstreamBot?start=${view.code}`);
    expect(codes.rows).toHaveLength(1);
  });

  it('refuses link codes when no bot is set up', async () => {
    api.enabled = false;
    await expect(service.createLinkCode('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('accepts webhook calls only with the right secret header', () => {
    expect(() => service.checkSecret(undefined)).toThrow(UnauthorizedException);
    expect(() => service.checkSecret('wrong')).toThrow(UnauthorizedException);
    expect(() => service.checkSecret('the-webhook-secret')).not.toThrow();
    expect(secretMatches('a', 'ab')).toBe(false);
  });

  it('links the chat with /start CODE, and the code works only once', async () => {
    const { code } = await service.createLinkCode('user-1');

    await expect(say(`/start ${code}`)).resolves.toMatch(/^Linked/);
    expect(profiles[0].telegram_chat_id).toBe(777);
    expect(audit.log).toHaveBeenCalledWith('user-1', 'telegram.linked', 'profile', 'user-1', null);
    await expect(say(`/start ${code}`, 888)).resolves.toMatch(/wrong or has expired/);
  });

  it('moves a chat to the account it was last linked to', async () => {
    profiles[1].telegram_chat_id = 777;
    const { code } = await service.createLinkCode('user-1');
    await say(`/start@OwnstreamBot ${code}`);

    expect(profiles).toEqual([
      { id: 'user-1', telegram_chat_id: 777 },
      { id: 'user-2', telegram_chat_id: null },
    ]);
  });

  it('refuses an expired code', async () => {
    const { code } = await service.createLinkCode('user-1');
    await expect(say(`/start ${code}`, 777, Date.now() + LINK_CODE_TTL_MS + 1000)).resolves.toMatch(/expired/);
    expect(profiles[0].telegram_chat_id).toBeNull();
  });

  it('stops a chat after too many wrong codes', async () => {
    for (let i = 0; i < MAX_WRONG_CODES; i++) await say('/start 000000');
    const { code } = await service.createLinkCode('user-1');
    await expect(say(`/start ${code}`)).resolves.toMatch(/Too many wrong codes/);
    await expect(say(`/start ${code}`, 999)).resolves.toMatch(/^Linked/);
  });

  it('answers account questions only in a linked chat', async () => {
    await expect(say('/status')).resolves.toMatch(/not linked/);
    profiles[0].telegram_chat_id = 777;
    registry.register({ deviceId: HOST, userId: 'user-1', socket: { id: 's' } as Socket, mode: 'streaming' });
    sessions.openFor.mockResolvedValue([{ hostDeviceId: HOST, status: 'active', gameTitle: 'Days Gone' } as SessionView]);

    await expect(say('/status')).resolves.toBe('Desk PC: online, streaming mode\nSession running on Desk PC: Days Gone');
    registry.unregister(HOST, 's');
    sessions.openFor.mockResolvedValue([]);
    await expect(say('/status')).resolves.toBe('Desk PC: offline, last seen 5 min ago\nNo session is running.');
  });

  it('asks for confirmation before /stop ends the session', async () => {
    profiles[0].telegram_chat_id = 777;
    await expect(say('/stop')).resolves.toMatch(/\/stop confirm/);
    expect(sessions.endAllFor).not.toHaveBeenCalled();
    await expect(say('/stop confirm')).resolves.toBe('The session was ended.');
    expect(sessions.endAllFor).toHaveBeenCalledWith('user-1');
  });

  it('ignores group chats and anything without text, and explains itself otherwise', async () => {
    await expect(service.handleUpdate(update('/status', 777, 'group'))).resolves.toBeNull();
    await expect(service.handleUpdate({ message: { chat: { id: 777, type: 'private' } } })).resolves.toBeNull();
    await expect(service.handleUpdate('junk')).resolves.toBeNull();
    await expect(say('/help')).resolves.toBe(HELP_TEXT);
    await expect(say('hello')).resolves.toMatch(/\/help/);
  });

  it('reads commands with or without the bot name', () => {
    expect(parseCommand('/start 123456')).toEqual({ command: 'start', arg: '123456' });
    expect(parseCommand(' /Status@OwnstreamBot ')).toEqual({ command: 'status', arg: '' });
    expect(parseCommand('status')).toBeNull();
  });
});

describe('AlertsService', () => {
  const event = { userId: 'user-1', sessionId: 's1', hostDeviceId: 'h1', gameTitle: 'Days Gone', lengthSeconds: 3900 } as const;

  it('writes clear alert texts', () => {
    expect(sessionAlert({ ...event, kind: 'started', status: 'active' }, 'Desk PC')).toEqual({
      alert: 'new_device_session',
      text: 'A session started on Desk PC: Days Gone.',
    });
    expect(sessionAlert({ ...event, kind: 'ended', status: 'failed' }, 'Desk PC').text).toBe(
      'The stream on Desk PC: Days Gone stopped unexpectedly after 1 h 5 min.',
    );
    expect(taskAlert({ kind: 'finished', userId: 'u', taskId: 't', title: 'Tidy notes', status: 'done' })).toEqual({
      alert: 'ai_task_finished',
      text: 'AI task "Tidy notes" finished.',
    });
    expect(formatLength(40)).toBe('40 s');
    expect(formatLength(720)).toBe('12 min');
  });

  it('sends an alert only when the user turned it on and linked a chat', async () => {
    const api = { enabled: true, sendMessage: jest.fn(async () => true) };
    const rules = { isEnabled: jest.fn(async () => true) };
    const telegram = { chatIdFor: jest.fn(async (): Promise<number | null> => 777) };
    const devices = { findOneBy: jest.fn(async () => ({ name: 'Desk PC' })) };
    const deviceEvents = new DeviceEvents();
    const alerts = new AlertsService(
      api as unknown as TelegramApi,
      telegram as unknown as TelegramService,
      rules as unknown as AlertRulesService,
      deviceEvents,
      { events$: { subscribe: () => ({ unsubscribe() {} }) } } as unknown as SessionsService,
      { events$: { subscribe: () => ({ unsubscribe() {} }) } } as unknown as AgentTasksService,
      devices as unknown as Repository<DeviceEntity>,
    );
    alerts.onModuleInit();

    deviceEvents.hostWentOffline({ deviceId: 'h1', userId: 'user-1' });
    await new Promise((r) => setImmediate(r));
    expect(rules.isEnabled).toHaveBeenCalledWith('user-1', 'host_offline');
    expect(api.sendMessage).toHaveBeenCalledWith(777, 'Desk PC is offline. It stopped answering.');

    rules.isEnabled.mockResolvedValue(false);
    await expect(alerts.notify('user-1', 'host_online', 'x')).resolves.toBe(false);
    rules.isEnabled.mockResolvedValue(true);
    telegram.chatIdFor.mockResolvedValue(null);
    await expect(alerts.notify('user-1', 'host_online', 'x')).resolves.toBe(false);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    alerts.onModuleDestroy();
  });
});
