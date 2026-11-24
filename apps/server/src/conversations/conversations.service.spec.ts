import { NotFoundException } from '@nestjs/common';
import { RealtimeEvent } from '@ownstream/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { ConversationEntity, DeviceEntity, PersonaEntity } from '../database/entities';
import { HostRegistry } from '../realtime/host-registry.service';
import { ConversationsService, DEFAULT_MODEL } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

const HOST = '11111111-1111-4111-8111-111111111111';
const PERSONA = '33333333-3333-4333-8333-333333333333';

describe('ConversationsService', () => {
  let conversations: { find: jest.Mock; findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let devices: { findOneBy: jest.Mock };
  let personas: { findOneBy: jest.Mock };
  let hosts: { emitToHost: jest.Mock };
  let service: ConversationsService;

  beforeEach(() => {
    conversations = {
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async () => null),
      create: jest.fn((data: Partial<ConversationEntity>) => ({ ...data })),
      save: jest.fn(async (data: Partial<ConversationEntity>) => ({ id: 'c1', ...data })),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    devices = { findOneBy: jest.fn(async () => ({ id: HOST })) };
    personas = { findOneBy: jest.fn(async () => ({ id: PERSONA })) };
    hosts = { emitToHost: jest.fn(() => true) };
    service = new ConversationsService(
      conversations as unknown as Repository<ConversationEntity>,
      devices as unknown as Repository<DeviceEntity>,
      personas as unknown as Repository<PersonaEntity>,
      hosts as unknown as HostRegistry,
    );
  });

  it('creates a conversation with only metadata and the default model', async () => {
    const created = await service.create('user-1', { hostDeviceId: HOST });

    expect(created).toMatchObject({ id: 'c1', hostDeviceId: HOST, title: 'New chat', model: DEFAULT_MODEL, personaId: null });
    expect(created).not.toHaveProperty('userId');
    expect(devices.findOneBy).toHaveBeenCalledWith({ id: HOST, userId: 'user-1' });
  });

  it("refuses another user's host or persona with a 404", async () => {
    devices.findOneBy.mockResolvedValueOnce(null);
    await expect(service.create('user-1', { hostDeviceId: HOST })).rejects.toBeInstanceOf(NotFoundException);

    personas.findOneBy.mockResolvedValueOnce(null);
    await expect(service.create('user-1', { hostDeviceId: HOST, personaId: PERSONA })).rejects.toBeInstanceOf(NotFoundException);
    expect(personas.findOneBy).toHaveBeenCalledWith({ id: PERSONA, userId: 'user-1' });
    expect(conversations.save).not.toHaveBeenCalled();
  });

  it('lists only the user’s conversations, newest first', async () => {
    await service.list('user-1');

    expect(conversations.find).toHaveBeenCalledWith({ where: { userId: 'user-1' }, order: { updatedAt: 'DESC' } });
  });

  it('renames, changes the model and removes the persona', async () => {
    conversations.findOneBy.mockResolvedValue({ id: 'c1', userId: 'user-1', title: 'Old', model: 'a', personaId: PERSONA });

    const updated = await service.update('user-1', 'c1', { title: 'Homework', model: 'llama3.2:1b', personaId: null });

    expect(updated).toMatchObject({ title: 'Homework', model: 'llama3.2:1b', personaId: null });
  });

  it("returns 404 for another user's conversation", async () => {
    await expect(service.update('user-2', 'c1', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('user-2', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(conversations.delete).not.toHaveBeenCalled();
  });

  it('deletes the conversation and tells its host to purge the messages', async () => {
    conversations.findOneBy.mockResolvedValue({ id: 'c1', userId: 'user-1', hostDeviceId: HOST });

    await service.remove('user-1', 'c1');

    expect(conversations.delete).toHaveBeenCalledWith({ id: 'c1', userId: 'user-1' });
    expect(hosts.emitToHost).toHaveBeenCalledWith(HOST, RealtimeEvent.ChatPurge, { conversationId: 'c1' });
  });

  it('accepts Ollama model names and rejects anything else', async () => {
    const good = plainToInstance(CreateConversationDto, { hostDeviceId: HOST, model: 'qwen2.5:3b' });
    const bad = plainToInstance(CreateConversationDto, { hostDeviceId: HOST, model: 'rm -rf /' });

    expect(await validate(good)).toHaveLength(0);
    expect((await validate(bad)).map((e) => e.property)).toEqual(['model']);
  });
});
