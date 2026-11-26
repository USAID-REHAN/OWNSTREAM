import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealtimeEvent, SessionRequestPayload, SessionStatus } from '@ownstream/shared';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EnvironmentVariables } from '../config/env.validation';
import { DeviceEntity, GameEntity, StreamProfileEntity, StreamSessionEntity } from '../database/entities';
import { DeviceEvents } from '../devices/device-events.service';
import { HostRegistry } from '../realtime/host-registry.service';
import { RulesDecision, RulesEngineService } from '../rules/rules-engine.service';
import { iceServersFrom } from './ice-servers';
import { parseEnd, parseReject, parseSessionId } from './sessions.gateway';
import { REQUEST_TIMEOUT_MS, SessionEvent, SessionsService, toSessionView } from './sessions.service';

const HOST = '11111111-1111-4111-8111-111111111111';
const OTHER_HOST = '33333333-3333-4333-8333-333333333333';
const GAME = '44444444-4444-4444-8444-444444444444';
const PROFILE = '55555555-5555-4555-8555-555555555555';
const SESSION = '22222222-2222-4222-8222-222222222222';

type Where = Record<string, unknown>;
const matches = (row: object, where: Where) =>
  Object.entries(where).every(([k, v]) => {
    const value = (row as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && '_type' in (v as object)) {
      const op = v as { _type: string; _value: unknown };
      if (op._type === 'in') return (op._value as unknown[]).includes(value);
      if (op._type === 'lessThan') return value instanceof Date && value < (op._value as Date);
    }
    return value === v;
  });

/** A tiny in-memory stream_sessions table, enough to follow the status flow. */
function fakeSessions() {
  const rows = new Map<string, StreamSessionEntity>();
  let next = 0;
  const save = async (d: StreamSessionEntity) => {
    const defaults = { createdAt: new Date(Date.now() + next++), startedAt: null, endedAt: null, avgFps: null, avgLatencyMs: null, note: null };
    const row = Object.assign(defaults, d, { id: d.id ?? (next === 1 ? SESSION : `s${next}`) }) as StreamSessionEntity;
    rows.set(row.id, row);
    return row;
  };
  const count = async ({ where }: { where: Where }) => [...rows.values()].filter((r) => matches(r, where)).length;
  const repo = {
    rows,
    findOneBy: jest.fn(async (where: Where) => [...rows.values()].find((r) => matches(r, where)) ?? null),
    findOne: jest.fn(async ({ where }: { where: Where }) => [...rows.values()].find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: { where: Where }) => [...rows.values()].filter((r) => matches(r, where))),
    update: jest.fn(async (where: Where, changes: Partial<StreamSessionEntity>) => {
      let affected = 0;
      for (const row of rows.values()) {
        if (matches(row, where)) {
          Object.assign(row, changes);
          affected++;
        }
      }
      return { affected };
    }),
    delete: jest.fn(async (where: Where) => {
      const hit = [...rows.values()].filter((r) => matches(r, where));
      hit.forEach((r) => rows.delete(r.id));
      return { affected: hit.length };
    }),
    manager: {
      transaction: jest.fn(async (work: (m: unknown) => Promise<unknown>) =>
        work({
          query: jest.fn(async () => []),
          count: (_: unknown, options: { where: Where }) => count(options),
          create: (_: unknown, d: Partial<StreamSessionEntity>) => ({ ...d }),
          save,
        }),
      ),
    },
  };
  return repo;
}

const table = <T extends object>(list: T[]) => ({
  findOneBy: jest.fn(async (where: Where) => list.find((r) => matches(r, where)) ?? null),
});

describe('SessionsService', () => {
  let sessions: ReturnType<typeof fakeSessions>;
  let registry: HostRegistry;
  let hostSocket: { id: string; emit: jest.Mock };
  let toUser: Array<[string, string, unknown]>;
  let deviceEvents: DeviceEvents;
  let decision: RulesDecision;
  let audit: { log: jest.Mock };
  let service: SessionsService;
  let raised: SessionEvent[];

  const games: Partial<GameEntity>[] = [
    { id: GAME, userId: 'user-1', title: 'Days Gone', launch: 'steam', launchTarget: 'steam://rungameid/1259420', hostDeviceId: HOST, profileId: PROFILE },
    { id: 'g-other-pc', userId: 'user-1', title: 'Mafia', launch: 'exe', launchTarget: 'C:\\Games\\Mafia\\mafia.exe', hostDeviceId: OTHER_HOST, profileId: null },
    { id: 'g-no-target', userId: 'user-1', title: 'Fortnite', launch: 'epic', launchTarget: null, hostDeviceId: null, profileId: null },
  ];
  const profiles: Partial<StreamProfileEntity>[] = [
    { id: PROFILE, userId: 'user-1', width: 1920, height: 1080, frameRate: 60, bitrateKbps: 12000, engine: 'builtin' },
  ];
  const devices: Partial<DeviceEntity>[] = [{ id: HOST, userId: 'user-1', role: 'host', name: 'Desk PC' }];

  const ask = (extra: { gameId?: string; profileId?: string } = { gameId: GAME }) =>
    service.request('user-1', { hostDeviceId: HOST, ...extra }, '203.0.113.5');
  const statusOf = (id = SESSION): SessionStatus | undefined => sessions.rows.get(id)?.status;
  const sentToHost = (event: string) => hostSocket.emit.mock.calls.filter(([e]) => e === event).map(([, p]) => p as unknown);

  beforeEach(() => {
    sessions = fakeSessions();
    registry = new HostRegistry();
    toUser = [];
    jest.spyOn(registry, 'emitToUser').mockImplementation((u, e, p) => void toUser.push([u, e, p]));
    hostSocket = { id: 'sock-1', emit: jest.fn() };
    registry.register({ deviceId: HOST, userId: 'user-1', socket: hostSocket as unknown as Socket, mode: 'streaming' });
    deviceEvents = new DeviceEvents();
    decision = { allowed: true, reason: null, needsApproval: false, idleTimeoutMinutes: null };
    audit = { log: jest.fn(async () => undefined) };
    const config = { get: (key: string) => ({ STUN_URLS: 'stun:stun.l.google.com:19302' })[key] };
    service = new SessionsService(
      sessions as unknown as Repository<StreamSessionEntity>,
      table(devices) as unknown as Repository<DeviceEntity>,
      table(games) as unknown as Repository<GameEntity>,
      table(profiles) as unknown as Repository<StreamProfileEntity>,
      registry,
      deviceEvents,
      { check: jest.fn(async () => decision) } as unknown as RulesEngineService,
      audit as unknown as AuditService,
      config as unknown as ConfigService<EnvironmentVariables, true>,
    );
    service.onModuleInit();
    raised = [];
    service.events$.subscribe((e) => raised.push(e));
  });

  afterEach(() => service.onModuleDestroy());

  it('sends the request to the host with the game to launch and the profile', async () => {
    decision = { ...decision, needsApproval: true, idleTimeoutMinutes: 30 };
    const view = await ask();

    expect(view).toMatchObject({ id: SESSION, status: 'requested', gameTitle: 'Days Gone', profileId: PROFILE, engine: 'builtin' });
    expect(view).not.toHaveProperty('userId');
    expect(sentToHost(RealtimeEvent.SessionRequest)).toEqual([
      {
        sessionId: SESSION,
        engine: 'builtin',
        game: { id: GAME, title: 'Days Gone', launch: 'steam', launchTarget: 'steam://rungameid/1259420' },
        profile: { width: 1920, height: 1080, frameRate: 60, bitrateKbps: 12000 },
        needsApproval: true,
        idleTimeoutMinutes: 30,
      } satisfies SessionRequestPayload,
    ]);
  });

  it("returns 404 for another user's PC, game or profile (test T16)", async () => {
    await expect(service.request('user-2', { hostDeviceId: HOST }, null)).rejects.toBeInstanceOf(NotFoundException);
    games.push({ id: 'g-user-2', userId: 'user-2', title: 'Theirs', launch: 'exe', launchTarget: 'C:\\x.exe', hostDeviceId: null });
    await expect(ask({ gameId: 'g-user-2' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(ask({ profileId: '66666666-6666-4666-8666-666666666666' })).rejects.toBeInstanceOf(NotFoundException);
    expect(hostSocket.emit).not.toHaveBeenCalled();
  });

  it('refuses a session an access rule blocks, with the reason, and logs it (test T15)', async () => {
    decision = { allowed: false, reason: 'Sessions are allowed only between 08:00 and 23:00', needsApproval: false, idleTimeoutMinutes: null };

    await expect(ask()).rejects.toThrow(new ForbiddenException('Sessions are allowed only between 08:00 and 23:00'));
    expect(audit.log).toHaveBeenCalledWith('user-1', 'session.refused', 'device', HOST, '203.0.113.5');
    expect(sessions.rows.size).toBe(0);
  });

  it('needs the PC online and in streaming mode', async () => {
    registry.setMode(HOST, 'ai');
    await expect(ask()).rejects.toThrow(new ConflictException('Switch to streaming mode first'));
    registry.unregister(HOST, 'sock-1');
    await expect(ask()).rejects.toThrow(new ConflictException('Your PC is offline'));
  });

  it('allows one open session per PC', async () => {
    await ask();
    await expect(ask()).rejects.toBeInstanceOf(ConflictException);
    expect(sessions.rows.size).toBe(1);
  });

  it('only launches games saved for this PC with a launch target', async () => {
    await expect(ask({ gameId: 'g-other-pc' })).rejects.toThrow(new BadRequestException('This game is saved for another PC'));
    await expect(ask({ gameId: 'g-no-target' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(ask({})).resolves.toMatchObject({ gameId: null, gameTitle: null });
  });

  it('host approval makes the session active and tells the browser', async () => {
    await ask();
    await expect(service.hostApproved(HOST, { sessionId: SESSION })).resolves.toBe(true);

    expect(statusOf()).toBe('active');
    expect(toUser).toContainEqual([
      'user-1',
      RealtimeEvent.SessionReady,
      { sessionId: SESSION, iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] },
    ]);
    expect(audit.log).toHaveBeenCalledWith('user-1', 'session.started', 'stream_session', SESSION, null);
    await new Promise((r) => setImmediate(r));
    expect(raised).toEqual([expect.objectContaining({ kind: 'started', gameTitle: 'Days Gone' })]);
  });

  it('ignores answers from a PC the session was not sent to', async () => {
    await ask();
    await expect(service.hostApproved(OTHER_HOST, { sessionId: SESSION })).resolves.toBe(false);
    await expect(service.hostEnded(OTHER_HOST, { sessionId: SESSION })).resolves.toBe(false);
    expect(statusOf()).toBe('requested');
  });

  it('host refusal is saved with the reason', async () => {
    await ask();
    await expect(service.hostRejected(HOST, { sessionId: SESSION, reason: 'Not now' })).resolves.toBe(true);

    expect(sessions.rows.get(SESSION)).toMatchObject({ status: 'rejected', note: 'Not now' });
    expect(toUser).toContainEqual(['user-1', RealtimeEvent.SessionReject, { sessionId: SESSION, reason: 'Not now' }]);
    expect(sentToHost(RealtimeEvent.SessionEnd)).toEqual([]);
  });

  it('the user ends an active session; the host is told and the length is kept', async () => {
    await ask();
    await service.hostApproved(HOST, { sessionId: SESSION });
    sessions.rows.get(SESSION)!.startedAt = new Date(Date.now() - 90_000);

    await expect(service.update('user-1', SESSION, { action: 'end' })).resolves.toMatchObject({ status: 'ended' });
    expect(sentToHost(RealtimeEvent.SessionEnd)).toEqual([{ sessionId: SESSION }]);
    expect(toSessionView(sessions.rows.get(SESSION)!).lengthSeconds).toBeGreaterThanOrEqual(90);
    await new Promise((r) => setImmediate(r));
    expect(raised.map((e) => e.kind)).toEqual(['started', 'ended']);
    await expect(service.update('user-1', SESSION, { action: 'end' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('the host ends a session with its averages', async () => {
    await ask();
    await service.hostApproved(HOST, { sessionId: SESSION });
    await expect(service.hostEnded(HOST, { sessionId: SESSION, avgFps: 59.6, avgLatencyMs: 18 })).resolves.toBe(true);

    expect(sessions.rows.get(SESSION)).toMatchObject({ status: 'ended', avgFps: 59.6, avgLatencyMs: 18 });
  });

  it('a browser can end only its own user’s session', async () => {
    await ask();
    await expect(service.viewerEnded('user-2', SESSION)).resolves.toBe(false);
    await expect(service.viewerEnded('user-1', SESSION)).resolves.toBe(true);
    expect(sessions.rows.get(SESSION)).toMatchObject({ status: 'ended', note: 'Cancelled before it started' });
  });

  it('fails open sessions when the PC goes offline', async () => {
    await ask();
    await service.hostApproved(HOST, { sessionId: SESSION });
    deviceEvents.hostWentOffline({ deviceId: HOST, userId: 'user-1' });
    await new Promise((r) => setImmediate(r));

    expect(sessions.rows.get(SESSION)).toMatchObject({ status: 'failed', note: 'The PC went offline' });
  });

  it('fails a request nobody answered in time', async () => {
    await ask();
    const sweep = (service as unknown as { failUnanswered(now: number): Promise<void> }).failUnanswered.bind(service);

    await sweep(Date.now());
    expect(statusOf()).toBe('requested');
    await sweep(Date.now() + REQUEST_TIMEOUT_MS + 1000);
    expect(sessions.rows.get(SESSION)).toMatchObject({ status: 'failed', note: 'The PC did not answer in time' });
    expect(sentToHost(RealtimeEvent.SessionEnd)).toEqual([{ sessionId: SESSION }]);
  });

  it('keeps notes and deletes only ended sessions', async () => {
    await ask();
    await expect(service.remove('user-1', SESSION)).rejects.toBeInstanceOf(ConflictException);
    await service.update('user-1', SESSION, { action: 'end' });
    await expect(service.update('user-1', SESSION, { note: 'Lag in chapter 3' })).resolves.toMatchObject({ note: 'Lag in chapter 3' });
    await expect(service.remove('user-2', SESSION)).rejects.toBeInstanceOf(NotFoundException);
    await service.remove('user-1', SESSION);
    expect(sessions.rows.size).toBe(0);
  });

  it('ends every open session for Telegram /stop', async () => {
    await ask();
    await expect(service.endAllFor('user-1')).resolves.toBe(1);
    await expect(service.endAllFor('user-1')).resolves.toBe(0);
  });
});

describe('session event payloads', () => {
  it('accepts only a session ID, a short reason and sane averages', () => {
    expect(parseSessionId({ sessionId: SESSION })).toEqual({ sessionId: SESSION });
    expect(parseSessionId({ sessionId: 'abc' })).toBeNull();
    expect(parseReject({ sessionId: SESSION, reason: 'x'.repeat(201) })).toBeNull();
    expect(parseEnd({ sessionId: SESSION, avgFps: 59.64, avgLatencyMs: 17.6 })).toEqual({ sessionId: SESSION, avgFps: 59.6, avgLatencyMs: 18 });
    expect(parseEnd({ sessionId: SESSION, avgFps: -1 })).toBeNull();
    expect(parseEnd({ sessionId: SESSION, avgLatencyMs: '5' })).toBeNull();
  });

  it('builds the ICE server list from the settings', () => {
    expect(iceServersFrom({})).toEqual([]);
    expect(iceServersFrom({ STUN_URLS: 'stun:a, stun:b', TURN_URL: 'turn:t', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' })).toEqual([
      { urls: ['stun:a', 'stun:b'] },
      { urls: 'turn:t', username: 'u', credential: 'c' },
    ]);
  });
});
