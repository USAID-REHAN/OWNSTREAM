import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { REALTIME_NAMESPACE, RealtimeEvent } from '@ownstream/shared';
import type { AddressInfo } from 'node:net';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AuditService } from '../audit/audit.service';
import { AuthCache } from '../auth/auth-cache.service';
import { ConversationEntity, DeviceEntity } from '../database/entities';
import { DeviceAuthService } from '../devices/device-auth.service';
import { DeviceEvents } from '../devices/device-events.service';
import { SupabaseService } from '../supabase/supabase.service';
import { HostRegistry } from './host-registry.service';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';
import { RelayService } from './relay.service';

const HOST_ID = '11111111-1111-4111-8111-111111111111';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PUBLIC_KEY = 'QUJDREVGR0g=';
const sealed = (channelId: string) => ({ channelId, iv: 'AAAAAAAAAAAAAAAA', ct: 'Y2lwaGVydGV4dA==' });

type Ack = { ok: boolean; error?: string; [key: string]: unknown };

/** Real Socket.IO server and clients; only the database and Supabase are replaced. */
describe('RealtimeGateway (Socket.IO)', () => {
  let app: INestApplication;
  let url: string;
  let clients: ClientSocket[];
  let deviceRepo: { update: jest.Mock; find: jest.Mock; findOneBy: jest.Mock };
  let audit: { log: jest.Mock };
  let events: DeviceEvents;

  beforeEach(async () => {
    clients = [];
    deviceRepo = {
      update: jest.fn(async () => ({ affected: 1 })),
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async ({ id, userId }: { id: string; userId: string }) =>
        id === HOST_ID && userId === USER_A ? { id, userId } : null,
      ),
    };
    audit = { log: jest.fn(async () => undefined) };
    const getUser = jest.fn(async (token: string) => {
      const id = { 'token-a': USER_A, 'token-b': USER_B }[token];
      return id ? { data: { user: { id, email: null } }, error: null } : { data: { user: null }, error: new Error('bad') };
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        HostRegistry,
        RelayService,
        PresenceService,
        DeviceEvents,
        AuthCache,
        {
          provide: DeviceAuthService,
          useValue: {
            authenticate: async (token: string) =>
              token === 'host-token' ? { id: HOST_ID, userId: USER_A, role: 'host' } : null,
          },
        },
        { provide: SupabaseService, useValue: { admin: { auth: { getUser } } } },
        { provide: AuditService, useValue: audit },
        { provide: getRepositoryToken(DeviceEntity), useValue: deviceRepo },
        { provide: getRepositoryToken(ConversationEntity), useValue: { find: async () => [{ id: 'conv-1' }] } },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}${REALTIME_NAMESPACE}`;
    events = app.get(DeviceEvents);
  });

  afterEach(async () => {
    clients.forEach((c) => c.disconnect());
    await app.close();
  });

  function connect(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
      clients.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  const send = (socket: ClientSocket, event: string, payload: unknown) =>
    socket.timeout(2000).emitWithAck(event, payload) as Promise<Ack>;

  function next<T = unknown>(socket: ClientSocket, event: string, ms = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  /** Resolves with every payload of an event received during a short wait. */
  function collect(socket: ClientSocket, event: string, ms = 300): Promise<unknown[]> {
    const seen: unknown[] = [];
    socket.on(event, (p: unknown) => seen.push(p));
    return new Promise((resolve) => setTimeout(() => resolve(seen), ms));
  }

  async function signedInHost(): Promise<ClientSocket> {
    const host = await connect();
    expect(await send(host, RealtimeEvent.HostHello, { token: 'host-token', mode: 'ai' })).toMatchObject({ ok: true });
    return host;
  }

  async function signedInViewer(token = 'token-a'): Promise<ClientSocket> {
    const viewer = await connect();
    expect(await send(viewer, RealtimeEvent.ViewerHello, { token })).toMatchObject({ ok: true });
    return viewer;
  }

  /** Opens an encrypted channel and completes the key exchange. */
  async function openChannel(viewer: ClientSocket, host: ClientSocket): Promise<string> {
    const hostGotHello = next<{ channelId: string; publicKey: string }>(host, RealtimeEvent.E2eHello);
    const ack = await send(viewer, RealtimeEvent.E2eHello, { hostId: HOST_ID, publicKey: PUBLIC_KEY });
    expect(ack.ok).toBe(true);
    const forwarded = await hostGotHello;
    expect(forwarded).toEqual({ channelId: ack.channelId, publicKey: PUBLIC_KEY });

    const viewerGotWelcome = next(viewer, RealtimeEvent.E2eWelcome);
    expect(await send(host, RealtimeEvent.E2eWelcome, { channelId: ack.channelId, publicKey: PUBLIC_KEY })).toEqual({ ok: true });
    expect(await viewerGotWelcome).toEqual({ channelId: ack.channelId, publicKey: PUBLIC_KEY });
    return ack.channelId as string;
  }

  it('refuses every event until the socket says hello', async () => {
    const socket = await connect();

    expect(await send(socket, RealtimeEvent.ChatMsg, sealed(HOST_ID))).toMatchObject({ ok: false });
    expect(await send(socket, RealtimeEvent.HostHeartbeat, { cpu: 1, gpu: null, ram: 1, mode: 'ai' })).toMatchObject({ ok: false });
  });

  it('signs a host in with its device token and tells the owner it is online', async () => {
    const viewer = await signedInViewer();
    const online = next(viewer, RealtimeEvent.HostOnline);
    const host = await connect();

    expect(await send(host, RealtimeEvent.HostHello, { token: 'wrong', mode: 'ai' })).toEqual({
      ok: false,
      error: 'Unknown or unpaired device',
    });
    expect(await send(host, RealtimeEvent.HostHello, { token: 'host-token', mode: 'ai' })).toEqual({
      ok: true,
      deviceId: HOST_ID,
      conversationIds: ['conv-1'],
    });
    expect(await online).toEqual({ hostId: HOST_ID, mode: 'ai' });
    expect(deviceRepo.update).toHaveBeenCalledWith({ id: HOST_ID }, expect.objectContaining({ isOnline: true, currentMode: 'ai' }));
  });

  it('signs a browser in with its Supabase token and lists its online hosts', async () => {
    await signedInHost();
    const viewer = await connect();

    expect(await send(viewer, RealtimeEvent.ViewerHello, { token: 'expired' })).toMatchObject({ ok: false });
    expect(await send(viewer, RealtimeEvent.ViewerHello, { token: 'token-a' })).toEqual({
      ok: true,
      hosts: [{ hostId: HOST_ID, mode: 'ai' }],
    });
  });

  it('relays the key exchange and encrypted chat unchanged between the owner and the host', async () => {
    const host = await signedInHost();
    const viewer = await signedInViewer();
    const channelId = await openChannel(viewer, host);

    const hostGotMsg = next(host, RealtimeEvent.ChatMsg);
    await send(viewer, RealtimeEvent.ChatMsg, { ...sealed(channelId), text: 'plain text must not pass' });
    expect(await hostGotMsg).toEqual(sealed(channelId));

    const viewerGotChunk = next(viewer, RealtimeEvent.ChatChunk);
    expect(await send(host, RealtimeEvent.ChatChunk, sealed(channelId))).toEqual({ ok: true });
    expect(await viewerGotChunk).toEqual(sealed(channelId));

    const viewerGotDone = next(viewer, RealtimeEvent.ChatDone);
    await send(host, RealtimeEvent.ChatDone, sealed(channelId));
    expect(await viewerGotDone).toEqual(sealed(channelId));
  });

  it("keeps other users out of a user's host and channels", async () => {
    const host = await signedInHost();
    const owner = await signedInViewer('token-a');
    const channelId = await openChannel(owner, host);
    const intruder = await signedInViewer('token-b');
    const hostMessages = collect(host, RealtimeEvent.ChatMsg);

    expect(await send(intruder, RealtimeEvent.E2eHello, { hostId: HOST_ID, publicKey: PUBLIC_KEY })).toEqual({
      ok: false,
      error: 'Host not found',
    });
    expect(await send(intruder, RealtimeEvent.ChatMsg, sealed(channelId))).toEqual({ ok: false, error: 'Unknown channel' });
    expect(await send(intruder, RealtimeEvent.ModeSet, { hostId: HOST_ID, mode: 'streaming' })).toMatchObject({ ok: false });

    expect(await hostMessages).toHaveLength(0);
    expect(audit.log).toHaveBeenCalledWith(USER_B, 'realtime.denied:e2e:hello', 'device', HOST_ID, null);
    expect(audit.log).toHaveBeenCalledWith(USER_B, 'realtime.denied:mode:set', 'device', HOST_ID, null);
  });

  it('only lets each side send in its own direction', async () => {
    const host = await signedInHost();
    const viewer = await signedInViewer();
    const channelId = await openChannel(viewer, host);

    expect(await send(host, RealtimeEvent.ChatMsg, sealed(channelId))).toMatchObject({ ok: false });
    expect(await send(viewer, RealtimeEvent.ChatChunk, sealed(channelId))).toMatchObject({ ok: false });
  });

  it('drops channels when the host leaves AI mode, and refuses new ones until it is back', async () => {
    const host = await signedInHost();
    const viewer = await signedInViewer();
    const channelId = await openChannel(viewer, host);

    const changed = next(viewer, RealtimeEvent.ModeChanged);
    expect(await send(host, RealtimeEvent.ModeChanged, { mode: 'streaming' })).toEqual({ ok: true });
    expect(await changed).toEqual({ hostId: HOST_ID, mode: 'streaming' });

    expect(await send(viewer, RealtimeEvent.ChatMsg, sealed(channelId))).toEqual({ ok: false, error: 'Unknown channel' });
    expect(await send(viewer, RealtimeEvent.E2eHello, { hostId: HOST_ID, publicKey: PUBLIC_KEY })).toEqual({
      ok: false,
      error: 'Switch the host to AI mode first',
    });
  });

  it('forwards mode requests to the host and heartbeats to the owner', async () => {
    const host = await signedInHost();
    const viewer = await signedInViewer();

    const hostGotModeSet = next(host, RealtimeEvent.ModeSet);
    expect(await send(viewer, RealtimeEvent.ModeSet, { hostId: HOST_ID, mode: 'streaming' })).toEqual({ ok: true });
    expect(await hostGotModeSet).toEqual({ mode: 'streaming' });

    const viewerGotBeat = next(viewer, RealtimeEvent.HostHeartbeat);
    expect(await send(host, RealtimeEvent.HostHeartbeat, { cpu: 12.5, gpu: 40, ram: 55, mode: 'ai' })).toEqual({ ok: true });
    expect(await viewerGotBeat).toEqual({ hostId: HOST_ID, cpu: 12.5, gpu: 40, ram: 55, mode: 'ai' });
    expect(await send(host, RealtimeEvent.HostHeartbeat, { cpu: 400, ram: 1, mode: 'ai' })).toMatchObject({ ok: false });
  });

  it('marks the host offline when it disconnects', async () => {
    const host = await signedInHost();
    const viewer = await signedInViewer();
    const offline = next(viewer, RealtimeEvent.HostOffline);

    host.disconnect();

    expect(await offline).toEqual({ hostId: HOST_ID });
    expect(deviceRepo.update).toHaveBeenCalledWith({ id: HOST_ID }, { isOnline: false });
  });

  it('disconnects the host at once when it is unpaired', async () => {
    const host = await signedInHost();
    const viewer = await signedInViewer();
    const hostDropped = next(host, 'disconnect');
    const offline = next(viewer, RealtimeEvent.HostOffline);

    events.deviceRevoked({ deviceId: HOST_ID, userId: USER_A });

    await hostDropped;
    expect(await offline).toEqual({ hostId: HOST_ID });
  });

  it('replaces an older connection of the same host without reporting it offline', async () => {
    const first = await signedInHost();
    const viewer = await signedInViewer();
    const offlineEvents = collect(viewer, RealtimeEvent.HostOffline, 500);
    const firstDropped = next(first, 'disconnect');

    await signedInHost();

    await firstDropped;
    expect(await offlineEvents).toHaveLength(0);
  });
});
