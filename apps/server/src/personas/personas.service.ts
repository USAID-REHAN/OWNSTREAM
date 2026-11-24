import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogEntity, PersonaEntity } from '../database/entities';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';
import { STARTER_PERSONAS, STARTERS_CREATED_ACTION } from './starter-personas';

export const MAX_PERSONAS = 30;
const DEFAULT_CREATIVITY = 0.7;

export interface PersonaView {
  id: string;
  name: string;
  systemPrompt: string;
  creativity: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPersonaView(p: PersonaEntity): PersonaView {
  return {
    id: p.id,
    name: p.name,
    systemPrompt: p.systemPrompt,
    creativity: p.creativity,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** F7 personas. Every query is limited to the logged in user. */
@Injectable()
export class PersonasService {
  /** Users whose starters are known to exist, so the check runs once per user per server start. */
  private readonly startersReady = new Set<string>();

  constructor(
    @InjectRepository(PersonaEntity) private readonly personas: Repository<PersonaEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Lists the user's personas. The first time, it also creates the three starter personas. */
  async list(userId: string): Promise<PersonaView[]> {
    await this.ensureStarters(userId);
    const rows = await this.personas.find({ where: { userId }, order: { createdAt: 'ASC', name: 'ASC' } });
    return rows.map(toPersonaView);
  }

  async create(userId: string, dto: CreatePersonaDto): Promise<PersonaView> {
    const count = await this.personas.count({ where: { userId } });
    if (count >= MAX_PERSONAS) {
      throw new BadRequestException(`You can keep at most ${MAX_PERSONAS} personas`);
    }
    const row = this.personas.create({
      userId,
      name: dto.name,
      systemPrompt: dto.systemPrompt,
      creativity: dto.creativity ?? DEFAULT_CREATIVITY,
    });
    return toPersonaView(await this.personas.save(row));
  }

  async update(userId: string, id: string, dto: UpdatePersonaDto): Promise<PersonaView> {
    const persona = await this.personas.findOneBy({ id, userId });
    if (!persona) throw this.notFound();
    if (dto.name !== undefined) persona.name = dto.name;
    if (dto.systemPrompt !== undefined) persona.systemPrompt = dto.systemPrompt;
    if (dto.creativity !== undefined) persona.creativity = dto.creativity;
    return toPersonaView(await this.personas.save(persona));
  }

  /** Conversations that used this persona keep working; their persona_id becomes null. */
  async remove(userId: string, id: string): Promise<void> {
    const result = await this.personas.delete({ id, userId });
    if (!result.affected) throw this.notFound();
  }

  /**
   * SCRUM-43: creates the starter personas exactly once per user. A row in audit_log marks that it
   * happened, so a user who deletes them does not get them back. The advisory lock stops two
   * requests at the same moment from creating them twice.
   */
  private async ensureStarters(userId: string): Promise<void> {
    if (this.startersReady.has(userId)) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
      const done = await manager.exists(AuditLogEntity, { where: { userId, action: STARTERS_CREATED_ACTION } });
      if (done) return;
      await manager.insert(
        PersonaEntity,
        STARTER_PERSONAS.map((p) => ({ ...p, userId })),
      );
      await manager.insert(AuditLogEntity, { userId, action: STARTERS_CREATED_ACTION, entity: 'persona' });
    });

    if (this.startersReady.size > 10_000) this.startersReady.clear();
    this.startersReady.add(userId);
  }

  /** Another user's persona gives the same 404 as a missing one, so IDs are never confirmed. */
  private notFound(): NotFoundException {
    return new NotFoundException('Persona not found');
  }
}
