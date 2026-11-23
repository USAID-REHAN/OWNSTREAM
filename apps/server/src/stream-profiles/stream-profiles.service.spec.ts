import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { StreamProfileEntity } from '../database/entities/stream-profile.entity';
import { CreateStreamProfileDto } from './dto/create-stream-profile.dto';
import { DEFAULT_STREAM_PROFILES, MAX_STREAM_PROFILES, StreamProfilesService } from './stream-profiles.service';

describe('StreamProfilesService', () => {
  const userId = 'user-1';
  let repo: {
    find: jest.Mock;
    findOneBy: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: StreamProfilesService;

  beforeEach(() => {
    repo = {
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      delete: jest.fn(async () => ({ affected: 0 })),
      create: jest.fn((data: Partial<StreamProfileEntity>) => ({ ...data })),
      save: jest.fn(async (data: unknown) => data),
    };
    service = new StreamProfilesService(repo as unknown as Repository<StreamProfileEntity>);
  });

  it('gives a new user the three default presets', async () => {
    const rows = await service.list(userId);

    expect(rows.map((r) => r.name)).toEqual(['1080p 60', '720p 60', '720p 30']);
    expect(rows.every((r) => r.userId === userId)).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('returns existing presets without adding the defaults again', async () => {
    const existing = [{ id: 'p1', userId, name: 'Mine' }];
    repo.find.mockResolvedValue(existing);

    await expect(service.list(userId)).resolves.toBe(existing);
    expect(repo.find).toHaveBeenCalledWith({ where: { userId }, order: { createdAt: 'ASC' } });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('creates a preset owned by the logged in user', async () => {
    const created = await service.create(userId, { name: '4K 30', width: 3840, height: 2160, frameRate: 30 });

    expect(created).toMatchObject({ name: '4K 30', userId });
  });

  it('refuses a new preset once the user has the maximum', async () => {
    repo.count.mockResolvedValue(MAX_STREAM_PROFILES);

    await expect(service.create(userId, { name: 'One more' })).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("returns 404 when updating another user's preset", async () => {
    await expect(service.update(userId, 'p2', { name: 'Hijack' })).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'p2', userId });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('changes only the fields that were sent', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'p1', userId, name: 'Old', width: 1920, frameRate: 60 });

    const updated = await service.update(userId, 'p1', { frameRate: 30 });

    expect(updated).toMatchObject({ name: 'Old', width: 1920, frameRate: 30 });
  });

  it("returns 404 when deleting a missing or another user's preset", async () => {
    await expect(service.remove(userId, 'p2')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.delete).toHaveBeenCalledWith({ id: 'p2', userId });
  });

  it('deletes an owned preset', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });

    await expect(service.remove(userId, 'p1')).resolves.toBeUndefined();
  });

  it('keeps the default presets inside the database limits', async () => {
    for (const preset of DEFAULT_STREAM_PROFILES) {
      expect(await validate(plainToInstance(CreateStreamProfileDto, preset))).toHaveLength(0);
    }
  });

  it('rejects values outside the database limits', async () => {
    const dto = plainToInstance(CreateStreamProfileDto, { name: 'Bad', width: 320, frameRate: 240, engine: 'other' });
    const fields = (await validate(dto)).map((e) => e.property).sort();

    expect(fields).toEqual(['engine', 'frameRate', 'width']);
  });
});
