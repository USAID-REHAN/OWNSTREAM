import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { AlertRuleEntity } from '../database/entities';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto/alert-rule.dto';

describe('AlertRulesService', () => {
  let repo: { find: jest.Mock; findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock; exists: jest.Mock };
  let service: AlertRulesService;

  beforeEach(() => {
    repo = {
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async () => null),
      create: jest.fn((d: Partial<AlertRuleEntity>) => ({ ...d })),
      save: jest.fn(async (d: Partial<AlertRuleEntity>) => ({ id: 'a1', ...d })),
      delete: jest.fn(async () => ({ affected: 0 })),
      exists: jest.fn(async () => true),
    };
    service = new AlertRulesService(repo as unknown as Repository<AlertRuleEntity>);
  });

  it('turns on an alert for an event', async () => {
    const rule = await service.create('user-1', { event: 'host_offline' });

    expect(rule).toMatchObject({ event: 'host_offline', enabled: true });
    expect(rule).not.toHaveProperty('userId');
  });

  it('answers 409 when the user already has that alert', async () => {
    repo.save.mockRejectedValue({ driverError: { code: '23505' } });

    await expect(service.create('user-1', { event: 'host_offline' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('turns an alert off', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'a1', userId: 'user-1', event: 'host_offline', enabled: true });

    await expect(service.update('user-1', 'a1', { enabled: false })).resolves.toMatchObject({ enabled: false });
  });

  it("returns 404 for another user's alert", async () => {
    await expect(service.update('user-2', 'a1', { enabled: false })).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'a1', userId: 'user-2' });
    await expect(service.remove('user-2', 'a1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tells the alert sender whether an alert is on', async () => {
    await expect(service.isEnabled('user-1', 'ai_task_finished')).resolves.toBe(true);
    expect(repo.exists).toHaveBeenCalledWith({ where: { userId: 'user-1', event: 'ai_task_finished', enabled: true } });
  });

  it('accepts only known events and a true/false switch', async () => {
    expect(await validate(plainToInstance(CreateAlertRuleDto, { event: 'host_online' }))).toHaveLength(0);
    expect(await validate(plainToInstance(CreateAlertRuleDto, { event: 'pc_on_fire' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateAlertRuleDto, {}))).not.toHaveLength(0);
  });
});
