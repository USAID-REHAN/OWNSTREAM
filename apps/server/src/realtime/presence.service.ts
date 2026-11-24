import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppMode, RealtimeEvent } from '@ownstream/shared';
import { LessThan, Repository } from 'typeorm';
import { DeviceEntity } from '../database/entities';
import { DeviceEvents } from '../devices/device-events.service';
import { HostRegistry } from './host-registry.service';
import { RelayService } from './relay.service';

/** A host that sent no heartbeat for this long is offline (hosts send one every 10 seconds). */
export const HEARTBEAT_TIMEOUT_MS = 45_000;
/** How often the offline check runs. */
export const SWEEP_INTERVAL_MS = 30_000;

/** Keeps devices.is_online, last_seen_at and current_mode up to date, and runs the offline check. */
@Injectable()
export class PresenceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Presence');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    private readonly registry: HostRegistry,
    private readonly relay: RelayService,
    private readonly events: DeviceEvents,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // After a restart no host is connected yet, so nothing can be online.
    await this.devices.update({ isOnline: true }, { isOnline: false });
    this.timer = setInterval(() => {
      this.sweep().catch((err: Error) => this.logger.warn(`Offline check failed: ${err.message}`));
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async markOnline(deviceId: string, mode: AppMode): Promise<void> {
    await this.devices.update({ id: deviceId }, { isOnline: true, currentMode: mode, lastSeenAt: new Date() });
  }

  async heartbeat(deviceId: string, mode: AppMode): Promise<void> {
    await this.devices.update({ id: deviceId }, { isOnline: true, currentMode: mode, lastSeenAt: new Date() });
  }

  async markOffline(deviceId: string, userId: string): Promise<void> {
    await this.devices.update({ id: deviceId }, { isOnline: false });
    this.registry.emitToUser(userId, RealtimeEvent.HostOffline, { hostId: deviceId });
    this.events.hostWentOffline({ deviceId, userId });
  }

  /**
   * SCRUM-38: marks hosts offline when no heartbeat arrived for 45 seconds, and closes a socket
   * that is still open but silent. Returns the IDs it marked offline.
   */
  async sweep(now: number = Date.now()): Promise<string[]> {
    const stale = await this.devices.find({
      where: { isOnline: true, lastSeenAt: LessThan(new Date(now - HEARTBEAT_TIMEOUT_MS)) },
      select: { id: true, userId: true },
    });
    for (const device of stale) {
      const connection = this.registry.get(device.id);
      if (connection) {
        this.registry.unregister(device.id, connection.socket.id);
        connection.socket.disconnect(true);
      }
      this.relay.dropForHost(device.id);
      await this.markOffline(device.id, device.userId);
    }
    return stale.map((d) => d.id);
  }
}
