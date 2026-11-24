import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface DeviceRevokedEvent {
  deviceId: string;
  userId: string;
}

/**
 * In-process device events. The realtime gateway subscribes to revoked$ and disconnects the
 * host's live socket as soon as the device is unpaired.
 */
@Injectable()
export class DeviceEvents {
  private readonly revoked = new Subject<DeviceRevokedEvent>();

  readonly revoked$: Observable<DeviceRevokedEvent> = this.revoked.asObservable();

  deviceRevoked(event: DeviceRevokedEvent): void {
    this.revoked.next(event);
  }
}
