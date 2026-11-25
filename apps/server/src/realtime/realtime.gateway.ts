import { Logger, OnModuleDestroy } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { REALTIME_NAMESPACE, RealtimeAck, RealtimeEvent } from '@ownstream/shared';
import type { Subscription } from 'rxjs';
import type { Namespace, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthCache } from '../auth/auth-cache.service';
import { Public } from '../auth/public.decorator';
import { verifySupabaseToken } from '../auth/verify-supabase-token';
import { ConversationEntity, DeviceEntity } from '../database/entities';
import { DeviceAuthService } from '../devices/device-auth.service';
import { DeviceEvents, DeviceRevokedEvent } from '../devices/device-events.service';
import { SupabaseService } from '../supabase/supabase.service';
import { HostRegistry, userRoom } from './host-registry.service';
import {
  parseE2eHello,
  parseE2eWelcome,
  parseHeartbeat,
  parseHostHello,
  parseMode,
  parseModeSet,
  parseSealed,
  parseToken,
} from './payloads';
import { PresenceService } from './presence.service';
import { RELAY_DIRECTIONS, RelayService } from './relay.service';
import { ackFail, ackOk, socketData } from './socket-identity';

/** A socket must say hello within this time, or it is disconnected. */
export const HELLO_TIMEOUT_MS = 10_000;
const MAX_HELLO_ATTEMPTS = 3;

const ok = ackOk;
const fail = ackFail;
const dataOf = socketData;

/**
 * The /realtime Socket.IO gateway (Implementation Plan section 9.2).
 * Hosts sign in with their device token (host:hello) and browsers with their Supabase token
 * (viewer:hello). Presence, mode changes and the encrypted relay all check ownership first.
 * Relayed payloads are forwarded unchanged and never logged or stored.
 *
 * Marked @Public and @SkipThrottle because the HTTP guards do not apply to sockets;
 * each socket authenticates with its hello event instead.
 */
@Public()
@SkipThrottle()
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger('Realtime');
  private revokedSubscription?: Subscription;

  constructor(
    private readonly deviceAuth: DeviceAuthService,
    private readonly supabase: SupabaseService,
    private readonly authCache: AuthCache,
    private readonly registry: HostRegistry,
    private readonly relay: RelayService,
    private readonly presence: PresenceService,
    private readonly audit: AuditService,
    private readonly deviceEvents: DeviceEvents,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
  ) {}

  afterInit(server: Namespace): void {
    this.registry.attach(server);
    this.revokedSubscription = this.deviceEvents.revoked$.subscribe((event) => this.onDeviceRevoked(event));
  }

  onModuleDestroy(): void {
    this.revokedSubscription?.unsubscribe();
  }

  handleConnection(client: Socket): void {
    const timer = setTimeout(() => {
      if (!dataOf(client).identity) client.disconnect(true);
    }, HELLO_TIMEOUT_MS);
    timer.unref();
    client.once('disconnect', () => clearTimeout(timer));
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.relay.dropForSocket(client.id);
    const identity = dataOf(client).identity;
    if (identity?.kind !== 'host') return;

    // Only the host's current socket marks it offline; a socket replaced by a newer one does not.
    const connection = this.registry.unregister(identity.deviceId, client.id);
    if (!connection) return;
    this.relay.dropForHost(identity.deviceId);
    await this.safely(() => this.presence.markOffline(identity.deviceId, identity.userId));
  }

  // ---- Sign in -------------------------------------------------------------------------------

  @SubscribeMessage(RealtimeEvent.HostHello)
  async hostHello(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const refused = this.checkHelloAllowed(client);
    if (refused) return refused;
    const hello = parseHostHello(body);
    if (!hello) return fail('Invalid host:hello payload');

    const device = await this.deviceAuth.authenticate(hello.token);
    if (!device) return fail('Unknown or unpaired device');

    dataOf(client).identity = { kind: 'host', deviceId: device.id, userId: device.userId };
    const previous = this.registry.register({ deviceId: device.id, userId: device.userId, socket: client, mode: hello.mode });
    if (previous && previous.socket.id !== client.id) {
      this.relay.dropForSocket(previous.socket.id);
      previous.socket.disconnect(true);
    }

    await this.safely(() => this.presence.markOnline(device.id, hello.mode));
    this.registry.emitToUser(device.userId, RealtimeEvent.HostOnline, { hostId: device.id, mode: hello.mode });
    // Lets other modules react, for example sending queued agent tasks to the host.
    this.deviceEvents.hostCameOnline({ deviceId: device.id, userId: device.userId });

    // The host deletes local messages of any conversation not in this list (deleted while it was offline).
    const conversations = await this.conversations.find({ where: { hostDeviceId: device.id }, select: { id: true } });
    return ok({ deviceId: device.id, conversationIds: conversations.map((c) => c.id) });
  }

  @SubscribeMessage(RealtimeEvent.ViewerHello)
  async viewerHello(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const refused = this.checkHelloAllowed(client);
    if (refused) return refused;
    const token = parseToken(body);
    if (!token) return fail('Invalid viewer:hello payload');

    const user = await this.safely(() => verifySupabaseToken(this.supabase, this.authCache, token));
    if (!user) return fail('Invalid or expired token');

    dataOf(client).identity = { kind: 'viewer', userId: user.id };
    await client.join(userRoom(user.id));
    const hosts = this.registry.onlineFor(user.id).map((h) => ({ hostId: h.deviceId, mode: h.mode }));
    return ok({ hosts });
  }

  // ---- Presence and mode -------------------------------------------------------------------------

  @SubscribeMessage(RealtimeEvent.HostHeartbeat)
  async heartbeat(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const host = this.hostOf(client);
    if (!host) return fail('Say host:hello first');
    const beat = parseHeartbeat(body);
    if (!beat) return fail('Invalid host:heartbeat payload');

    this.applyMode(host.deviceId, host.userId, beat.mode);
    await this.safely(() => this.presence.heartbeat(host.deviceId, beat.mode));
    this.registry.emitToUser(host.userId, RealtimeEvent.HostHeartbeat, { hostId: host.deviceId, ...beat });
    return ok();
  }

  /** Browser asks its host to switch between AI and streaming mode. */
  @SubscribeMessage(RealtimeEvent.ModeSet)
  async modeSet(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const viewer = this.viewerOf(client);
    if (!viewer) return fail('Say viewer:hello first');
    const request = parseModeSet(body);
    if (!request) return fail('Invalid mode:set payload');

    const host = this.registry.get(request.hostId);
    if (!host || host.userId !== viewer.userId) {
      if (host) await this.denied(viewer.userId, RealtimeEvent.ModeSet, request.hostId);
      return fail('Host not found or offline');
    }
    host.socket.emit(RealtimeEvent.ModeSet, { mode: request.mode });
    return ok();
  }

  /** Host reports that its mode changed. */
  @SubscribeMessage(RealtimeEvent.ModeChanged)
  async modeChanged(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const host = this.hostOf(client);
    if (!host) return fail('Say host:hello first');
    const mode = parseMode(body);
    if (!mode) return fail('Invalid mode:changed payload');

    this.applyMode(host.deviceId, host.userId, mode, true);
    await this.safely(() => this.presence.heartbeat(host.deviceId, mode));
    return ok();
  }

  // ---- Encrypted relay (SCRUM-40) -------------------------------------------------------------------

  /** Browser opens a secure channel: the server checks ownership, adds a channel ID and forwards the key. */
  @SubscribeMessage(RealtimeEvent.E2eHello)
  async e2eHello(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const viewer = this.viewerOf(client);
    if (!viewer) return fail('Say viewer:hello first');
    const hello = parseE2eHello(body);
    if (!hello) return fail('Invalid e2e:hello payload');

    // Ownership is read from the database every time, never cached.
    const owned = await this.devices.findOneBy({ id: hello.hostId, userId: viewer.userId });
    if (!owned) {
      await this.denied(viewer.userId, RealtimeEvent.E2eHello, hello.hostId);
      return fail('Host not found');
    }
    const host = this.registry.get(hello.hostId);
    if (!host) return fail('Host is offline');
    if (host.mode !== 'ai') return fail('Switch the host to AI mode first');

    const channel = this.relay.open(viewer.userId, host.deviceId, host.socket.id, client.id);
    if (!channel) return fail('Too many open channels');
    host.socket.emit(RealtimeEvent.E2eHello, { channelId: channel.channelId, publicKey: hello.publicKey });
    return ok({ channelId: channel.channelId });
  }

  @SubscribeMessage(RealtimeEvent.E2eWelcome)
  e2eWelcome(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): RealtimeAck {
    if (!this.hostOf(client)) return fail('Say host:hello first');
    const welcome = parseE2eWelcome(body);
    if (!welcome) return fail('Invalid e2e:welcome payload');

    const route = this.relay.route(welcome.channelId, client.id, 'toViewer');
    if (!route) return fail('Unknown channel');
    this.registry.emitToSocket(route.to, RealtimeEvent.E2eWelcome, welcome);
    return ok();
  }

  @SubscribeMessage(RealtimeEvent.ChatMsg)
  chatMsg(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): RealtimeAck {
    return this.forward(client, RealtimeEvent.ChatMsg, body);
  }

  @SubscribeMessage(RealtimeEvent.ChatChunk)
  chatChunk(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): RealtimeAck {
    return this.forward(client, RealtimeEvent.ChatChunk, body);
  }

  @SubscribeMessage(RealtimeEvent.ChatDone)
  chatDone(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): RealtimeAck {
    return this.forward(client, RealtimeEvent.ChatDone, body);
  }

  @SubscribeMessage(RealtimeEvent.ChatError)
  chatError(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): RealtimeAck {
    return this.forward(client, RealtimeEvent.ChatError, body);
  }

  @SubscribeMessage(RealtimeEvent.AgentStep)
  agentStep(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): RealtimeAck {
    return this.forward(client, RealtimeEvent.AgentStep, body);
  }

  @SubscribeMessage(RealtimeEvent.AgentLogFetch)
  agentLogFetch(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): RealtimeAck {
    return this.forward(client, RealtimeEvent.AgentLogFetch, body);
  }

  // ---- Helpers -------------------------------------------------------------------------------------

  /** Forwards { channelId, iv, ct } unchanged, only between the two sockets of that channel. */
  private forward(client: Socket, event: string, body: unknown): RealtimeAck {
    const identity = dataOf(client).identity;
    const direction = RELAY_DIRECTIONS[event];
    const expectedSender = direction === 'toHost' ? 'viewer' : 'host';
    if (!identity || identity.kind !== expectedSender) return fail(`Only a ${expectedSender} can send ${event}`);

    const sealed = parseSealed(body);
    if (!sealed) return fail(`Invalid ${event} payload`);
    const route = this.relay.route(sealed.channelId, client.id, direction);
    if (!route) return fail('Unknown channel');

    this.registry.emitToSocket(route.to, event, sealed);
    this.logger.debug(`${event} relayed (${sealed.ct.length} bytes)`);
    return ok();
  }

  private applyMode(deviceId: string, userId: string, mode: 'ai' | 'streaming', announce = false): void {
    const previous = this.registry.get(deviceId)?.mode;
    this.registry.setMode(deviceId, mode);
    // Leaving AI mode drops every open encrypted chat channel (section 10.3).
    if (mode !== 'ai') this.relay.dropForHost(deviceId);
    if (announce || previous !== mode) {
      this.registry.emitToUser(userId, RealtimeEvent.ModeChanged, { hostId: deviceId, mode });
    }
  }

  private onDeviceRevoked({ deviceId, userId }: DeviceRevokedEvent): void {
    const host = this.registry.get(deviceId);
    if (!host) return;
    this.registry.unregister(deviceId, host.socket.id);
    this.relay.dropForHost(deviceId);
    host.socket.disconnect(true);
    this.registry.emitToUser(userId, RealtimeEvent.HostOffline, { hostId: deviceId });
  }

  private checkHelloAllowed(client: Socket): RealtimeAck | null {
    const data = dataOf(client);
    if (data.identity) return fail('Already signed in');
    data.helloAttempts = (data.helloAttempts ?? 0) + 1;
    if (data.helloAttempts > MAX_HELLO_ATTEMPTS) {
      setImmediate(() => client.disconnect(true));
      return fail('Too many attempts');
    }
    return null;
  }

  private hostOf(client: Socket): { deviceId: string; userId: string } | null {
    const identity = dataOf(client).identity;
    return identity?.kind === 'host' ? identity : null;
  }

  private viewerOf(client: Socket): { userId: string } | null {
    const identity = dataOf(client).identity;
    return identity?.kind === 'viewer' ? identity : null;
  }

  /** An event about someone else's host is dropped and written to the audit log. */
  private denied(userId: string, event: string, hostId: string): Promise<void> {
    return this.audit.log(userId, `realtime.denied:${event}`, 'device', hostId, null);
  }

  /** Database or network failures are logged, never thrown at the socket. */
  private async safely<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      return await work();
    } catch (err) {
      this.logger.warn((err as Error).message);
      return null;
    }
  }
}
