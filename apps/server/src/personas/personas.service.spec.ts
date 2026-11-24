import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { AuditLogEntity, PersonaEntity } from '../database/entities';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { MAX_PERSONAS, PersonasService } from './personas.service';
import { STARTER_PERSONAS, STARTERS_CREATED_ACTION } from './starter-personas';

describe('PersonasService', () => {
  let repo: { find: jest.Mock; findOneBy: jest.Mock; count: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let manager: { query: jest.Mock; exists: jest.Mock; insert: jest.Mock };
  let transaction: jest.Mock;
  let service: PersonasService;

  beforeEach(() => {
    repo = {
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn((data: Partial<PersonaEntity>) => ({ ...data })),
      save: jest.fn(async (data: Partial<PersonaEntity>) => ({ id: 'p1', ...data })),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    manager = {
      query: jest.fn(async () => []),
      exists: jest.fn(async () => false),
      insert: jest.fn(async () => ({})),
    };
    transaction = jest.fn(async (work: (m: typeof manager) => Promise<void>) => work(manager));
    service = new PersonasService(
      repo as unknown as Repository<PersonaEntity>,
      { transaction } as unknown as DataSource,
    );
  });

  describe('starter personas (SCRUM-43)', () => {
    it('creates the three starters the first time a user lists personas', async () => {
      await service.list('user-1');

      expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['user-1']);
      const [entity, rows] = manager.insert.mock.calls[0];
      expect(entity).toBe(PersonaEntity);
      expect(rows.map((r: PersonaEntity) => r.name)).toEqual(['Study helper', 'Code reviewer', 'Plain language explainer']);
      expect(rows.every((r: PersonaEntity) => r.userId === 'user-1')).toBe(true);
      expect(manager.insert).toHaveBeenCalledWith(AuditLogEntity, {
        userId: 'user-1',
        action: STARTERS_CREATED_ACTION,
        entity: 'persona',
      });
    });

    it('never creates them again once they were created, even if the user deleted them', async () => {
      manager.exists.mockResolvedValue(true);

      await service.list('user-1');

      expect(manager.exists).toHaveBeenCalledWith(AuditLogEntity, {
        where: { userId: 'user-1', action: STARTERS_CREATED_ACTION },
      });
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('checks the database only once per user while the server runs', async () => {
      await service.list('user-1');
      await service.list('user-1');

      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('keeps the starters inside the persona limits', async () => {
      for (const starter of STARTER_PERSONAS) {
        expect(await validate(plainToInstance(CreatePersonaDto, starter))).toHaveLength(0);
      }
    });
  });

  describe('CRUD (SCRUM-42)', () => {
    it("lists only the user's personas", async () => {
      repo.find.mockResolvedValue([{ id: 'p1', userId: 'user-1', name: 'Mine', systemPrompt: 'x', creativity: 0.7 }]);

      const list = await service.list('user-1');

      expect(repo.find).toHaveBeenCalledWith({ where: { userId: 'user-1' }, order: { createdAt: 'ASC', name: 'ASC' } });
      expect(list[0]).not.toHaveProperty('userId');
    });

    it('creates a persona with the default creativity', async () => {
      const created = await service.create('user-1', { name: 'Helper', systemPrompt: 'Be brief.' });

      expect(created).toMatchObject({ name: 'Helper', systemPrompt: 'Be brief.', creativity: 0.7 });
    });

    it('refuses a new persona once the user has the maximum', async () => {
      repo.count.mockResolvedValue(MAX_PERSONAS);

      await expect(service.create('user-1', { name: 'One more', systemPrompt: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('changes only the fields that were sent', async () => {
      repo.findOneBy.mockResolvedValue({ id: 'p1', userId: 'user-1', name: 'Old', systemPrompt: 'Keep me', creativity: 0.7 });

      const updated = await service.update('user-1', 'p1', { creativity: 1.2 });

      expect(updated).toMatchObject({ name: 'Old', systemPrompt: 'Keep me', creativity: 1.2 });
    });

    it("returns 404 for another user's persona", async () => {
      await expect(service.update('user-2', 'p1', { name: 'Mine now' })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'p1', userId: 'user-2' });
      await expect(service.remove('user-2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.delete).toHaveBeenCalledWith({ id: 'p1', userId: 'user-2' });
    });

    it('deletes an owned persona', async () => {
      repo.delete.mockResolvedValue({ affected: 1 });

      await expect(service.remove('user-1', 'p1')).resolves.toBeUndefined();
    });
  });

  describe('validation', () => {
    it('trims text and accepts creativity from 0 to 1.5 with one decimal', async () => {
      const dto = plainToInstance(CreatePersonaDto, { name: '  Tutor  ', systemPrompt: ' Teach. ', creativity: 1.5 });

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.name).toBe('Tutor');
    });

    it('rejects empty names, missing prompts and out of range creativity', async () => {
      const errors = await validate(plainToInstance(CreatePersonaDto, { name: '  ', creativity: 2 }));

      expect(errors.map((e) => e.property).sort()).toEqual(['creativity', 'name', 'systemPrompt']);
      expect(await validate(plainToInstance(CreatePersonaDto, { name: 'A', systemPrompt: 'B', creativity: 0.75 }))).not.toHaveLength(0);
    });
  });
});
