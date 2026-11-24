import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AppMode, DeviceRole } from '@ownstream/shared';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { DeviceEntity } from '../database/entities';
import { DeviceEvents } from './device-events.service';

/** What the website sees. The token hash never leaves the server. */
export interface DeviceView {
  id: string;
  name: string;
  role: DeviceRole;
  os: string | null;
  isOnline: boolean;
  currentMode: AppMode;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export function toDeviceView(device: DeviceEntity): DeviceView {
  return {
    id: device.id,
    name: device.name,
    role: device.role,
    os: device.os,
    isOnline: device.isOnline,
    currentMode: device.currentMode,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
  };
}

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    private readonly events: DeviceEvents,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<DeviceView[]> {
    const rows = await this.devices.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return rows.map(toDeviceView);
  }

  async rename(userId: string, id: string, name: string): Promise<DeviceView> {
    const device = await this.devices.findOneBy({ id, userId });
    if (!device) throw this.notFound();
    device.name = name;
    return toDeviceView(await this.devices.save(device));
  }

  /**
   * Deleting the row removes the token hash, so the device token stops working at once.
   * The gateway is told so it can drop the host's live socket.
   */
  async unpair(userId: string, id: string, ip: string | null): Promise<void> {
    const result = await this.devices.delete({ id, userId });
    if (!result.affected) throw this.notFound();
    this.events.deviceRevoked({ deviceId: id, userId });
    await this.audit.log(userId, 'device.unpaired', 'device', id, ip);
  }

  /** Another user's device gives the same 404 as a missing one, so IDs are never confirmed. */
  private notFound(): NotFoundException {
    return new NotFoundException('Device not found');
  }
}
