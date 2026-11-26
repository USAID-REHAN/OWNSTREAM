import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  RealtimeEvent,
  SessionApprovePayload,
  SessionEndPayload,
  SessionReadyPayload,
  SessionRejectPayload,
  SessionRequestPayload,
  SessionStatus,
  StreamEngine,
} from '@ownstream/shared';
import { Observable, Subject, Subscription } from 'rxjs';
import { In, LessThan, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EnvironmentVariables } from '../config/env.validation';
import { DeviceEntity, GameEntity, StreamProfileEntity, StreamSessionEntity } from '../database/entities';
import { DeviceEvents } from '../devices/device-events.service';
import { launchTargetError } from '../games/launch-target';
import { HostRegistry } from '../realtime/host-registry.service';
import { RulesEngineService } from '../rules/rules-engine.service';
import { CreateSessionDto, ListSessionsQuery, UpdateSessionDto } from './dto/session.dto';
import { iceServersFrom } from './ice-servers';

/** A host that has not answered a session request in this time (for example, nobody pressed Allow) fails it. */
export const REQUEST_TIMEOUT_MS = 2 * 60_000;
const SWEEP_INTERVAL_MS = 30_000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_REASON = 200;

const OPEN: SessionStatus[] = ['requested', 'active'];

/** The session status flow. Anything not listed here is refused. */
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  requested: ['active', 'rejected', 'failed', 'ended'],
  active: ['ended', 'failed'],
  ended: [],
  failed: [],
  rejected: [],
};
export const canMoveSession = (from: SessionStatus, to: SessionStatus) => TRANSITIONS[from].includes(to);

export interface SessionView {
  id: string;
  hostDeviceId: string;
  gameId: string | null;
  gameTitle: string | null;
  profileId: string | null;
  engine: StreamEngine;
  status: SessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  /** How long the session was active, once it has ended. */
  lengthSeconds: number | null;
  avgFps: number | null;
  avgLatencyMs: number | null;
  note: string | null;
  createdAt: Date;
}

export const lengthSeconds = (s: Pick<StreamSessionEntity, 'startedAt' | 'endedAt'>): number | null =>
  s.startedAt && s.endedAt ? Math.max(0, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)) : null;

export function toSessionView(s: StreamSessionEntity, gameTitle: string | null = s.game?.title ?? null): SessionView {
  return {
    id: s.id,
    hostDeviceId: s.hostDeviceId,
    gameId: s.gameId,
    gameTitle,
    profileId: s.profileId,
    engine: s.engine,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    lengthSeconds: lengthSeconds(s),
    avgFps: s.avgFps,
    avgLatencyMs: s.avgLatencyMs,
    note: s.note,
    createdAt: s.createdAt,
  };
}

/** Raised for the Telegram alerts (new_device_session and stream_ended). */
export interface SessionEvent {
  kind: 'started' | 'ended';
  userId: string;
  sessionId: string;
  hostDeviceId: string;
  gameTitle: string | null;
  status: SessionStatus;
  lengthSeconds: number | null;
}

type Ender = 'user' | 'host' | 'server';

/**
 * F5 session control plane (SCRUM-51). The website asks for a session; the server checks ownership
 * and the access rules, then sends session:request to the host. The host answers with
 * session:approve (and launches the game) or session:reject. Either side can end it.
 */
@Injectable()
export class SessionsService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Sessions');
  private readonly events = new Subject<SessionEvent>();
  private readonly iceServers: SessionReadyPayload['iceServers'];
  private subscription?: Subscription;
  private timer: NodeJS.Timeout | null = null;

  readonly events$: Observable<SessionEvent> = this.events.asObservable();

  constructor(
    @InjectRepository(StreamSessionEntity) private readonly sessions: Repository<StreamSessionEntity>,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    @InjectRepository(StreamProfileEntity) private readonly profiles: Repository<StreamProfileEntity>,
    private readonly hosts: HostRegistry,
    private readonly deviceEvents: DeviceEvents,
    private readonly rules: RulesEngineService,
    private readonly audit: AuditService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.iceServers = iceServersFrom({
      STUN_URLS: config.get('STUN_URLS', { infer: true }),
      TURN_URL: config.get('TURN_URL', { infer: true }),
      TURN_USERNAME: config.get('TURN_USERNAME', { infer: true }),
      TURN_CREDENTIAL: config.get('TURN_CREDENTIAL', { infer: true }),
    });
  }

  onModuleInit(): void {
    this.subscription = this.deviceEvents.hostOffline$.subscribe(({ deviceId }) =>
      this.background(this.failOpen({ hostDeviceId: deviceId }, 'The PC went offline')),
    );
    this.timer = setInterval(() => this.background(this.failUnanswered()), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  /** After a restart no host is connected, so no session can still be open. */
  async onApplicationBootstrap(): Promise<void> {
    await this.sessions.update(
      { status: In(OPEN) },
      { status: 'failed', endedAt: new Date(), note: 'The server restarted during the session' },
    );
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.timer) clearInterval(this.timer);
  }

  // ---- Website (REST) -------------------------------------------------------------------------

  async list(userId: string, query: ListSessionsQuery): Promise<SessionView[]> {
    const rows = await this.sessions.find({
      where: { userId, ...(query.status ? { status: query.status } : {}), ...(query.hostDeviceId ? { hostDeviceId: query.hostDeviceId } : {}) },
      relations: { game: true },
      order: { createdAt: 'DESC' },
      take: query.limit ?? DEFAULT_LIST_LIMIT,
    });
    return rows.map((s) => toSessionView(s));
  }

  async get(userId: string, id: string): Promise<SessionView> {
    const session = await this.sessions.findOne({ where: { id, userId }, relations: { game: true } });
    if (!session) throw new NotFoundException('Session not found');
    return toSessionView(session);
  }

  /** POST /api/sessions: ownership, then access rules, then the host's state, then session:request. */
  async request(userId: string, dto: CreateSessionDto, ip: string | null): Promise<SessionView> {
    const device = await this.devices.findOneBy({ id: dto.hostDeviceId, userId, role: 'host' });
    if (!device) throw new NotFoundException('Device not found');
    const game = dto.gameId ? await this.findLaunchableGame(userId, dto.gameId, device.id) : null;
    const profileId = dto.profileId ?? game?.profileId ?? null;
    const profile = profileId ? await this.profiles.findOneBy({ id: profileId, userId }) : null;
    if (dto.profileId && !profile) throw new NotFoundException('Stream profile not found');

    const decision = await this.rules.check(userId, { clientIp: ip });
    if (!decision.allowed) {
      await this.audit.log(userId, 'session.refused', 'device', device.id, ip);
      throw new ForbiddenException(decision.reason ?? 'An access rule refused this session');
    }

    const host = this.hosts.get(device.id);
    if (!host) throw new ConflictException('Your PC is offline');
    if (host.mode !== 'streaming') throw new ConflictException('Switch to streaming mode first');

    const session = await this.insertIfHostFree({
      userId,
      hostDeviceId: device.id,
      gameId: game?.id ?? null,
      profileId: profile?.id ?? null,
      engine: dto.engine ?? profile?.engine ?? 'builtin',
      status: 'requested',
    });
    if (!session) throw new ConflictException('A session is already open on this PC');

    const payload: SessionRequestPayload = {
      sessionId: session.id,
      engine: session.engine,
      game: game ? { id: game.id, title: game.title, launch: game.launch, launchTarget: game.launchTarget as string } : null,
      profile: profile
        ? { width: profile.width, height: profile.height, frameRate: profile.frameRate, bitrateKbps: profile.bitrateKbps }
        : null,
      needsApproval: decision.needsApproval,
      idleTimeoutMinutes: decision.idleTimeoutMinutes,
    };
    if (!this.hosts.emitToHost(device.id, RealtimeEvent.SessionRequest, payload)) {
      await this.finish(session, 'failed', 'server', { note: 'The PC went offline' });
      throw new ConflictException('Your PC is offline');
    }
    return toSessionView(session, game?.title ?? null);
  }

  /** End the session, or add a note. */
  async update(userId: string, id: string, dto: UpdateSessionDto): Promise<SessionView> {
    if (dto.action === undefined && dto.note === undefined) throw new BadRequestException('Nothing to change');
    const session = await this.findOwned(userId, id);

    if (dto.action === 'end') {
      if (!OPEN.includes(session.status)) throw new ConflictException('This session has already ended');
      if (!(await this.finish(session, 'ended', 'user', this.cancelNote(session)))) {
        throw new ConflictException('This session has already ended');
      }
    }
    if (dto.note !== undefined) await this.sessions.update({ id, userId }, { note: dto.note });
    return this.get(userId, id);
  }

  /** Deletes a history entry. An open session must be ended first. */
  async remove(userId: string, id: string): Promise<void> {
    const session = await this.findOwned(userId, id);
    if (OPEN.includes(session.status)) throw new ConflictException('End the session before deleting it');
    await this.sessions.delete({ id, userId });
  }

  // ---- Host and browser (realtime) --------------------------------------------------------------

  /** session:approve from the host the session was sent to. */
  async hostApproved(deviceId: string, payload: SessionApprovePayload): Promise<boolean> {
    const session = await this.sessions.findOneBy({ id: payload.sessionId, hostDeviceId: deviceId });
    if (!session || session.status !== 'requested') return false;
    if (!(await this.move(session, 'active', { startedAt: new Date() }))) return false;

    const ready: SessionReadyPayload = { sessionId: session.id, iceServers: this.iceServers };
    this.hosts.emitToUser(session.userId, RealtimeEvent.SessionReady, ready);
    await this.audit.log(session.userId, 'session.started', 'stream_session', session.id, null);
    this.raise('started', session);
    return true;
  }

  /** session:reject from the host the session was sent to. */
  async hostRejected(deviceId: string, payload: SessionRejectPayload): Promise<boolean> {
    const session = await this.sessions.findOneBy({ id: payload.sessionId, hostDeviceId: deviceId });
    if (!session || session.status !== 'requested') return false;
    const note = payload.reason?.trim().slice(0, MAX_REASON) || 'Refused on the PC';
    return this.finish(session, 'rejected', 'host', { note });
  }

  /** session:end from the host, with its averages if it has them. */
  async hostEnded(deviceId: string, payload: SessionEndPayload): Promise<boolean> {
    const session = await this.sessions.findOneBy({ id: payload.sessionId, hostDeviceId: deviceId });
    if (!session || !OPEN.includes(session.status)) return false;
    if (session.status === 'requested') return this.finish(session, 'rejected', 'host', { note: 'Closed on the PC before it started' });
    return this.finish(session, 'ended', 'host', {
      avgFps: payload.avgFps ?? null,
      avgLatencyMs: payload.avgLatencyMs ?? null,
    });
  }

  /** session:end from one of the user's browser tabs. */
  async viewerEnded(userId: string, sessionId: string): Promise<boolean> {
    const session = await this.sessions.findOneBy({ id: sessionId, userId });
    if (!session || !OPEN.includes(session.status)) return false;
    return this.finish(session, 'ended', 'user', this.cancelNote(session));
  }

  /** Open sessions of a user, for the Telegram /status command. */
  async openFor(userId: string): Promise<SessionView[]> {
    const rows = await this.sessions.find({ where: { userId, status: In(OPEN) }, relations: { game: true } });
    return rows.map((s) => toSessionView(s));
  }

  /** Ends every open session of a user (Telegram /stop). Returns how many were ended. */
  async endAllFor(userId: string): Promise<number> {
    const rows = await this.sessions.find({ where: { userId, status: In(OPEN) } });
    let ended = 0;
    for (const session of rows) {
      if (await this.finish(session, 'ended', 'user', { note: 'Ended from Telegram' })) ended += 1;
    }
    return ended;
  }

  // ---- Internals --------------------------------------------------------------------------------

  /**
   * One open session per PC. The advisory lock (per host) makes the check and the insert one step,
   * so two requests at the same moment cannot both get through.
   */
  private insertIfHostFree(row: Partial<StreamSessionEntity> & { hostDeviceId: string }): Promise<StreamSessionEntity | null> {
    return this.sessions.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`stream_session:${row.hostDeviceId}`]);
      const open = await manager.count(StreamSessionEntity, { where: { hostDeviceId: row.hostDeviceId, status: In(OPEN) } });
      if (open > 0) return null;
      return manager.save(manager.create(StreamSessionEntity, row));
    });
  }

  /** The game must be the user's, saved for this PC (or for any PC), and have a valid launch target. */
  private async findLaunchableGame(userId: string, gameId: string, hostDeviceId: string): Promise<GameEntity> {
    const game = await this.games.findOneBy({ id: gameId, userId });
    if (!game) throw new NotFoundException('Game not found');
    if (game.hostDeviceId && game.hostDeviceId !== hostDeviceId) throw new BadRequestException('This game is saved for another PC');
    if (!game.launchTarget) throw new BadRequestException('Add a launch target to this game first');
    const error = launchTargetError(game.launch, game.launchTarget);
    if (error) throw new BadRequestException(error);
    return game;
  }

  /** Closes a session, tells the other side and the user's browser tabs, and writes the audit entry. */
  private async finish(
    session: StreamSessionEntity,
    to: Extract<SessionStatus, 'ended' | 'failed' | 'rejected'>,
    by: Ender,
    extra: Partial<StreamSessionEntity> = {},
  ): Promise<boolean> {
    const wasActive = session.status === 'active';
    if (!(await this.move(session, to, { endedAt: new Date(), ...extra }))) return false;

    // The host stops capture and releases input; it already knows when it ended or refused the session itself.
    if (by !== 'host') this.hosts.emitToHost(session.hostDeviceId, RealtimeEvent.SessionEnd, { sessionId: session.id });
    if (to === 'rejected') {
      this.hosts.emitToUser(session.userId, RealtimeEvent.SessionReject, { sessionId: session.id, reason: session.note });
    } else {
      this.hosts.emitToUser(session.userId, RealtimeEvent.SessionEnd, { sessionId: session.id, status: to, note: session.note });
    }
    await this.audit.log(session.userId, `session.${to}`, 'stream_session', session.id, null);
    if (wasActive) this.raise('ended', session);
    return true;
  }

  /** Changes the status only if it is still what we read, so two updates cannot both win. */
  private async move(session: StreamSessionEntity, to: SessionStatus, extra: Partial<StreamSessionEntity> = {}): Promise<boolean> {
    if (!canMoveSession(session.status, to)) return false;
    const result = await this.sessions.update({ id: session.id, status: session.status }, { status: to, ...extra });
    if (!result.affected) return false;
    Object.assign(session, { status: to, ...extra });
    return true;
  }

  private async failOpen(where: { hostDeviceId: string }, note: string): Promise<void> {
    const rows = await this.sessions.find({ where: { ...where, status: In(OPEN) } });
    for (const session of rows) await this.finish(session, 'failed', 'server', { note });
  }

  /** Requests nobody answered on the PC within REQUEST_TIMEOUT_MS. */
  private async failUnanswered(now = Date.now()): Promise<void> {
    const rows = await this.sessions.find({
      where: { status: 'requested', createdAt: LessThan(new Date(now - REQUEST_TIMEOUT_MS)) },
    });
    for (const session of rows) await this.finish(session, 'failed', 'server', { note: 'The PC did not answer in time' });
  }

  private raise(kind: SessionEvent['kind'], session: StreamSessionEntity): void {
    const event = (gameTitle: string | null): SessionEvent => ({
      kind,
      userId: session.userId,
      sessionId: session.id,
      hostDeviceId: session.hostDeviceId,
      gameTitle,
      status: session.status,
      lengthSeconds: lengthSeconds(session),
    });
    if (!session.gameId) {
      this.events.next(event(null));
      return;
    }
    this.background(this.games.findOneBy({ id: session.gameId }).then((g) => this.events.next(event(g?.title ?? null))));
  }

  /** A request the user withdraws before the PC answered gets a note; an ended stream keeps the user's own note. */
  private cancelNote(session: StreamSessionEntity): Partial<StreamSessionEntity> {
    return session.status === 'requested' ? { note: 'Cancelled before it started' } : {};
  }

  private async findOwned(userId: string, id: string): Promise<StreamSessionEntity> {
    const session = await this.sessions.findOneBy({ id, userId });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private background(work: Promise<unknown>): void {
    work.catch((err: Error) => this.logger.warn(err.message));
  }
}
