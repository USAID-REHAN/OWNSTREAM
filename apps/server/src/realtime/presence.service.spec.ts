import { RealtimeEvent } from '@ownstream/shared';
import type { Socket } from 'socket.io';
import { FindOperator, Repository } from 'typeorm';
import { DeviceEntity } from '../database/entities';
import { DeviceEvents, HostOfflineEvent } from '../devices/device-events.service';
import { HostRegistry } from './host-registry.service';
import { HEARTBEAT_TIMEOUT_MS, PresenceService } from './presence.service';
import { RelayService } from './relay.service';

describe('PresenceService (offline check)', () => {
  let repo: { update: jest.Mock; find: jest.Mock };
  let registry: HostRegistry;
  let relay: RelayService;
  let events: DeviceEvents;
  let presence: PresenceService;
  let emitted: Array<[string, string, unknown]>;

  beforeEach(() => {
    repo = { update: jest.fn(async () => ({ affected: 1 })), find: jest.fn(async () => []) };
    registry = new HostRegistry();
    emitted = [];
    jest.spyOn(registry, 'emitToUser').mockImplementation((userId, event, payload) => {
      emitted.push([userId, event, payload]);
    });
    relay = new RelayService();
    events = new DeviceEvents();
    presence = new PresenceService(repo as unknown as Repository<DeviceEntity>, registry, relay, events);
  });

  afterEach(() => presence.onModuleDestroy());

  it('asks for online hosts whose last heartbeat is older than 45 seconds', async () => {
    const now = Date.parse('2026-11-24T12:00:00Z');

    await presence.sweep(now);

    const where = repo.find.mock.calls[0][0].where;
    expect(where.isOnline).toBe(true);
    expect(where.lastSeenAt).toBeInstanceOf(FindOperator);
    expect((where.lastSeenAt as FindOperator<Date>).value).toEqual(new Date(now - HEARTBEAT_TIMEOUT_MS));
  });

  it('marks silent hosts offline, closes their socket, drops their channels and raises an event', async () => {
    repo.find.mockResolvedValue([{ id: 'host-1', userId: 'user-1' }]);
    const socket = { id: 's1', disconnect: jest.fn(), emit: jest.fn() } as unknown as Socket;
    registry.register({ deviceId: 'host-1', userId: 'user-1', socket, mode: 'ai' });
    relay.open('user-1', 'host-1', 's1', 'browser-1');
    const offline: HostOfflineEvent[] = [];
    events.hostOffline$.subscribe((e) => offline.push(e));

    await expect(presence.sweep()).resolves.toEqual(['host-1']);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(registry.get('host-1')).toBeUndefined();
    expect(relay.size).toBe(0);
    expect(repo.update).toHaveBeenCalledWith({ id: 'host-1' }, { isOnline: false });
    expect(emitted).toEqual([['user-1', RealtimeEvent.HostOffline, { hostId: 'host-1' }]]);
    expect(offline).toEqual([{ deviceId: 'host-1', userId: 'user-1' }]);
  });

  it('resets every host to offline when the server starts', async () => {
    await presence.onApplicationBootstrap();

    expect(repo.update).toHaveBeenCalledWith({ isOnline: true }, { isOnline: false });
  });
});
