import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvent } from '@ownstream/shared';
import { Repository } from 'typeorm';
import { ConversationEntity, DeviceEntity, PersonaEntity } from '../database/entities';
import { HostRegistry } from '../realtime/host-registry.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

/** The model the host runs by default (Implementation Plan section 1). */
export const DEFAULT_MODEL = 'qwen2.5:3b';

export interface ConversationView {
  id: string;
  hostDeviceId: string | null;
  personaId: string | null;
  title: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toConversationView(c: ConversationEntity): ConversationView {
  return {
    id: c.id,
    hostDeviceId: c.hostDeviceId,
    personaId: c.personaId,
    title: c.title,
    model: c.model,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * F6 conversations. Neon stores only the title, model and persona; the messages themselves
 * live encrypted-in-transit between the browser and the host, and are saved only on the host.
 */
@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(ConversationEntity) private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(PersonaEntity) private readonly personas: Repository<PersonaEntity>,
    private readonly hosts: HostRegistry,
  ) {}

  async list(userId: string): Promise<ConversationView[]> {
    const rows = await this.conversations.find({ where: { userId }, order: { updatedAt: 'DESC' } });
    return rows.map(toConversationView);
  }

  async create(userId: string, dto: CreateConversationDto): Promise<ConversationView> {
    await this.assertOwnedHost(userId, dto.hostDeviceId);
    if (dto.personaId) await this.assertOwnedPersona(userId, dto.personaId);

    const row = this.conversations.create({
      userId,
      hostDeviceId: dto.hostDeviceId,
      personaId: dto.personaId ?? null,
      title: dto.title ?? 'New chat',
      model: dto.model ?? DEFAULT_MODEL,
    });
    return toConversationView(await this.conversations.save(row));
  }

  async update(userId: string, id: string, dto: UpdateConversationDto): Promise<ConversationView> {
    const conversation = await this.findOwned(userId, id);
    if (dto.personaId) await this.assertOwnedPersona(userId, dto.personaId);

    if (dto.title !== undefined) conversation.title = dto.title;
    if (dto.model !== undefined) conversation.model = dto.model;
    if (dto.personaId !== undefined) conversation.personaId = dto.personaId;
    return toConversationView(await this.conversations.save(conversation));
  }

  /** Deletes the conversation and tells the host (if online) to delete its stored messages. */
  async remove(userId: string, id: string): Promise<void> {
    const conversation = await this.findOwned(userId, id);
    await this.conversations.delete({ id, userId });
    if (conversation.hostDeviceId) {
      // An offline host catches up on host:hello, which lists the conversations that still exist.
      this.hosts.emitToHost(conversation.hostDeviceId, RealtimeEvent.ChatPurge, { conversationId: id });
    }
  }

  private async findOwned(userId: string, id: string): Promise<ConversationEntity> {
    const conversation = await this.conversations.findOneBy({ id, userId });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async assertOwnedHost(userId: string, deviceId: string): Promise<void> {
    const device = await this.devices.findOneBy({ id: deviceId, userId });
    if (!device) throw new NotFoundException('Device not found');
  }

  private async assertOwnedPersona(userId: string, personaId: string): Promise<void> {
    const persona = await this.personas.findOneBy({ id: personaId, userId });
    if (!persona) throw new NotFoundException('Persona not found');
  }
}
