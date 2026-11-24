import {
  BadRequestException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { DeviceEntity, PairingCodeEntity } from '../database/entities';
import { DeviceTokenService } from './device-token.service';
import { MAX_DEVICES_PER_USER, PAIRING_PICKUP_WINDOW_MS, PairingService } from './pairing.service';

const tokens = new DeviceTokenService({ get: () => 'test-pepper-0123456789' } as unknown as ConfigService<never, true>);
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

function codeRow(overrides: Partial<PairingCodeEntity> = {}): PairingCodeEntity {
  return {
    id: 'code-1',
    code: '123456',
    hostName: 'Gaming laptop',
    hostOs: 'Windows 11',
    secretHash: tokens.hash('host-secret'),
    expiresAt: minutesFromNow(5),
    claimedByUser: null,
    deviceId: null,
    createdAt: new Date(),
    ...overrides,
  } as PairingCodeEntity;
}

describe('PairingService', () => {
  let codes: { delete: jest.Mock; insert: jest.Mock; findOneBy: jest.Mock; update: jest.Mock };
  let devices: { count: jest.Mock };
  let manager: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };
  let audit: { log: jest.Mock };
  let service: PairingService;

  beforeEach(() => {
    codes = {
      delete: jest.fn(async () => ({ affected: 0 })),
      insert: jest.fn(async () => ({})),
      findOneBy: jest.fn(async () => null),
      update: jest.fn(async () => ({ affected: 0 })),
    };
    devices = { count: jest.fn(async () => 0) };
    manager = {
      findOne: jest.fn(async () => null),
      create: jest.fn((_entity: unknown, data: Partial<DeviceEntity>) => ({ ...data })),
      save: jest.fn(async (data: Partial<DeviceEntity>) => ({ ...data, id: 'device-1' })),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const dataSource = {
      transaction: jest.fn(async (work: (m: typeof manager) => Promise<unknown>) => work(manager)),
    } as unknown as DataSource;
    audit = { log: jest.fn() };
    service = new PairingService(
      codes as unknown as Repository<PairingCodeEntity>,
      devices as unknown as Repository<DeviceEntity>,
      dataSource,
      tokens,
      audit as unknown as AuditService,
    );
  });

  describe('createCode', () => {
    it('returns a six digit code and a secret, and stores only the secret hash', async () => {
      const created = await service.createCode({ hostName: 'Gaming laptop', hostOs: 'Windows 11' });

      expect(created.code).toMatch(/^\d{6}$/);
      expect(created.pollIntervalSeconds).toBe(6);
      const stored = codes.insert.mock.calls[0][0];
      expect(stored).toMatchObject({ code: created.code, hostName: 'Gaming laptop', hostOs: 'Windows 11' });
      expect(stored.secretHash).toBe(tokens.hash(created.pairingSecret));
      expect(JSON.stringify(stored)).not.toContain(created.pairingSecret);
    });

    it('tries a new code when one is already taken', async () => {
      codes.insert.mockRejectedValueOnce({ driverError: { code: '23505' } });

      await service.createCode({ hostName: 'Laptop' });

      expect(codes.insert).toHaveBeenCalledTimes(2);
    });

    it('gives up after five collisions', async () => {
      codes.insert.mockRejectedValue({ driverError: { code: '23505' } });

      await expect(service.createCode({ hostName: 'Laptop' })).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(codes.insert).toHaveBeenCalledTimes(5);
    });
  });

  describe('status', () => {
    it('gives the same 404 for an unknown code and a wrong secret', async () => {
      await expect(service.status('123456', 'host-secret', null)).rejects.toBeInstanceOf(NotFoundException);

      codes.findOneBy.mockResolvedValue(codeRow());
      await expect(service.status('123456', 'stolen-guess', null)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.status('123456', undefined, null)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.status('abc', 'host-secret', null)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports pending until the user claims the code', async () => {
      codes.findOneBy.mockResolvedValue(codeRow());

      await expect(service.status('123456', 'host-secret', null)).resolves.toMatchObject({ status: 'pending' });
    });

    it('reports expired codes', async () => {
      codes.findOneBy.mockResolvedValue(codeRow({ expiresAt: minutesFromNow(-1) }));

      await expect(service.status('123456', 'host-secret', null)).resolves.toEqual({ status: 'expired' });
    });

    it('creates the device and returns its token once the code is claimed', async () => {
      const claimed = codeRow({ claimedByUser: 'user-1' });
      codes.findOneBy.mockResolvedValue(claimed);
      manager.findOne.mockResolvedValue(claimed);

      const result = await service.status('123456', 'host-secret', '203.0.113.7');

      expect(result).toMatchObject({ status: 'paired', deviceId: 'device-1' });
      const token = (result as { deviceToken: string }).deviceToken;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(manager.findOne.mock.calls[0][1]).toMatchObject({ lock: { mode: 'pessimistic_write' } });
      const device = manager.save.mock.calls[0][0];
      expect(device).toMatchObject({ userId: 'user-1', name: 'Gaming laptop', role: 'host', tokenHash: tokens.hash(token) });
      expect(JSON.stringify(device)).not.toContain(token);
      expect(manager.update).toHaveBeenCalledWith(PairingCodeEntity, { id: 'code-1' }, { deviceId: 'device-1' });
      expect(audit.log).toHaveBeenCalledWith('user-1', 'device.paired', 'device', 'device-1', '203.0.113.7');
    });

    it('never hands out a token twice', async () => {
      codes.findOneBy.mockResolvedValue(codeRow({ claimedByUser: 'user-1', deviceId: 'device-1' }));

      await expect(service.status('123456', 'host-secret', null)).rejects.toBeInstanceOf(GoneException);
    });

    it('lets only one of two simultaneous polls collect the token', async () => {
      codes.findOneBy.mockResolvedValue(codeRow({ claimedByUser: 'user-1' }));
      // The second poll gets the row lock after the first one has already set device_id.
      manager.findOne.mockResolvedValue(codeRow({ claimedByUser: 'user-1', deviceId: 'device-1' }));

      await expect(service.status('123456', 'host-secret', null)).rejects.toBeInstanceOf(GoneException);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('claim', () => {
    it('claims an open code for the user and opens a short pickup window', async () => {
      codes.update.mockResolvedValue({ affected: 1 });
      codes.findOneBy.mockResolvedValue(codeRow({ claimedByUser: 'user-1' }));
      const before = Date.now();

      await expect(service.claim('user-1', '123456', null)).resolves.toEqual({
        status: 'claimed',
        hostName: 'Gaming laptop',
      });

      const [where, changes] = codes.update.mock.calls[0];
      expect(where.code).toBe('123456');
      expect(changes.claimedByUser).toBe('user-1');
      expect(changes.expiresAt.getTime()).toBeGreaterThanOrEqual(before + PAIRING_PICKUP_WINDOW_MS);
      expect(audit.log).toHaveBeenCalledWith('user-1', 'device.pair_claimed', 'pairing_code', 'code-1', null);
    });

    it('gives a 404 for a wrong, expired or already claimed code', async () => {
      await expect(service.claim('user-1', '000000', null)).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refuses once the user has the maximum number of devices', async () => {
      devices.count.mockResolvedValue(MAX_DEVICES_PER_USER);

      await expect(service.claim('user-1', '123456', null)).rejects.toBeInstanceOf(BadRequestException);
      expect(codes.update).not.toHaveBeenCalled();
    });
  });
});
