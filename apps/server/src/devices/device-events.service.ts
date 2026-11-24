import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface DeviceRevokedEvent {
  deviceId: string;
  userId: string;
}

export interface HostOfflineEvent {
  deviceId: string;
  userId: string;
}

/**
 * In-process device events.
 * - revoked$: the realtime gateway disconnects the host's live socket as soon as it is unpaired.
 * - hostOffline$: a host stopped sending heartbeats or disconnected (the Telegram alerts use this).
 */
@Injectable()
export class DeviceEvents {
  private readonly revoked = new Subject<DeviceRevokedEvent>();
  private readonly offline = new Subject<HostOfflineEvent>();

  readonly revoked$: Observable<DeviceRevokedEvent> = this.revoked.asObservable();
  readonly hostOffline$: Observable<HostOfflineEvent> = this.offline.asObservable();

  deviceRevoked(event: DeviceRevokedEvent): void {
    this.revoked.next(event);
  }

  hostWentOffline(event: HostOfflineEvent): void {
    this.offline.next(event);
  }
}
