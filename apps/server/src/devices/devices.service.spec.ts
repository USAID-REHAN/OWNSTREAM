import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { DeviceEntity } from '../database/entities';
import { DeviceEvents, DeviceRevokedEvent } from './device-events.service';
import { DevicesService } from './devices.service';
import { ClaimPairingCodeDto } from './dto/claim-pairing-code.dto';
import { RenameDeviceDto } from './dto/rename-device.dto';

const device = (overrides: Partial<DeviceEntity> = {}): DeviceEntity =>
  ({
    id: 'd1',
    userId: 'user-1',
    name: 'Gaming laptop',
    role: 'host',
    tokenHash: 'secret-hash',
    os: 'Windows 11',
    isOnline: true,
    currentMode: 'ai',
    lastSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as DeviceEntity;

describe('DevicesService', () => {
  let repo: { find: jest.Mock; findOneBy: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let events: DeviceEvents;
  let audit: { log: jest.Mock };
  let service: DevicesService;

  beforeEach(() => {
    repo = {
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async () => null),
      save: jest.fn(async (d: DeviceEntity) => d),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    events = new DeviceEvents();
    audit = { log: jest.fn() };
    service = new DevicesService(repo as unknown as Repository<DeviceEntity>, events, audit as unknown as AuditService);
  });

  it("lists only the user's devices and never returns the token hash", async () => {
    repo.find.mockResolvedValue([device()]);

    const list = await service.list('user-1');

    expect(repo.find).toHaveBeenCalledWith({ where: { userId: 'user-1' }, order: { createdAt: 'ASC' } });
    expect(list[0]).toMatchObject({ id: 'd1', name: 'Gaming laptop', isOnline: true, currentMode: 'ai' });
    expect(list[0]).not.toHaveProperty('tokenHash');
    expect(list[0]).not.toHaveProperty('userId');
  });

  it('renames an owned device', async () => {
    repo.findOneBy.mockResolvedValue(device());

    await expect(service.rename('user-1', 'd1', 'Desk PC')).resolves.toMatchObject({ name: 'Desk PC' });
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'd1', userId: 'user-1' });
  });

  it("returns 404 when renaming another user's device", async () => {
    await expect(service.rename('user-2', 'd1', 'Mine now')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('unpairs: deletes the device, tells the gateway and writes the audit log', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    const revoked: DeviceRevokedEvent[] = [];
    events.revoked$.subscribe((e) => revoked.push(e));

    await service.unpair('user-1', 'd1', '203.0.113.7');

    expect(repo.delete).toHaveBeenCalledWith({ id: 'd1', userId: 'user-1' });
    expect(revoked).toEqual([{ deviceId: 'd1', userId: 'user-1' }]);
    expect(audit.log).toHaveBeenCalledWith('user-1', 'device.unpaired', 'device', 'd1', '203.0.113.7');
  });

  it("returns 404 when unpairing another user's device, and revokes nothing", async () => {
    const revoked: DeviceRevokedEvent[] = [];
    events.revoked$.subscribe((e) => revoked.push(e));

    await expect(service.unpair('user-2', 'd1', null)).rejects.toBeInstanceOf(NotFoundException);
    expect(revoked).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('device DTOs', () => {
  it('accepts a six digit code, ignoring spaces', async () => {
    const dto = plainToInstance(ClaimPairingCodeDto, { code: '123 456' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.code).toBe('123456');
  });

  it('rejects codes that are not six digits', async () => {
    for (const code of ['12345', '1234567', 'abcdef', 123456]) {
      expect(await validate(plainToInstance(ClaimPairingCodeDto, { code }))).not.toHaveLength(0);
    }
  });

  it('trims device names and rejects empty ones', async () => {
    const ok = plainToInstance(RenameDeviceDto, { name: '  Desk PC  ' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.name).toBe('Desk PC');

    expect(await validate(plainToInstance(RenameDeviceDto, { name: '   ' }))).not.toHaveLength(0);
  });
});
