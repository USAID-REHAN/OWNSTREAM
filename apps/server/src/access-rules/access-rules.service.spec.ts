import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccessRuleEntity } from '../database/entities';
import { AccessRulesService } from './access-rules.service';

describe('AccessRulesService', () => {
  let repo: { find: jest.Mock; findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let service: AccessRulesService;

  beforeEach(() => {
    repo = {
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async () => null),
      create: jest.fn((d: Partial<AccessRuleEntity>) => ({ ...d })),
      save: jest.fn(async (d: Partial<AccessRuleEntity>) => ({ id: 'r1', ...d })),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    service = new AccessRulesService(repo as unknown as Repository<AccessRuleEntity>);
  });

  it('saves allowed hours in their cleaned form, with the default time zone', async () => {
    const rule = await service.create('user-1', { ruleType: 'allowed_hours', settings: { start: '08:00', end: '23:00', note: 'x' } });

    expect(rule).toMatchObject({ ruleType: 'allowed_hours', enabled: true, settings: { start: '08:00', end: '23:00', timezone: 'Asia/Karachi' } });
    expect(rule.settings).not.toHaveProperty('note');
    expect(rule).not.toHaveProperty('userId');
  });

  it('refuses settings that do not fit the rule type', async () => {
    await expect(service.create('user-1', { ruleType: 'allowed_hours', settings: { start: 'morning' } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('user-1', { ruleType: 'idle_timeout', settings: { minutes: 1000 } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create('user-1', { ruleType: 'block_unknown_network', settings: { networks: ['home wifi'] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('turns on approval with empty settings', async () => {
    await expect(service.create('user-1', { ruleType: 'require_approval' })).resolves.toMatchObject({ settings: { enabled: true } });
  });

  it('allows only one rule of each type per user', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'r0', ruleType: 'idle_timeout' });

    await expect(service.create('user-1', { ruleType: 'idle_timeout', settings: { minutes: 30 } })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.findOneBy).toHaveBeenCalledWith({ userId: 'user-1', ruleType: 'idle_timeout' });
  });

  it('checks new settings against the rule’s own type when editing', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'r1', userId: 'user-1', ruleType: 'idle_timeout', settings: { minutes: 30 }, enabled: true });

    await expect(service.update('user-1', 'r1', { settings: { start: '08:00', end: '23:00' } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update('user-1', 'r1', { settings: { minutes: 45 }, enabled: false })).resolves.toMatchObject({
      settings: { minutes: 45 },
      enabled: false,
    });
  });

  it("returns 404 for another user's rule", async () => {
    await expect(service.update('user-2', 'r1', { enabled: false })).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'r1', userId: 'user-2' });
    await expect(service.remove('user-2', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.delete).toHaveBeenCalledWith({ id: 'r1', userId: 'user-2' });
  });

  it('lists only the user’s rules', async () => {
    await service.list('user-1');
    expect(repo.find).toHaveBeenCalledWith({ where: { userId: 'user-1' }, order: { createdAt: 'ASC' } });
  });
});
