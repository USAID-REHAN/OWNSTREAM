import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StreamProfileEntity } from '../database/entities/stream-profile.entity';
import { CreateStreamProfileDto } from './dto/create-stream-profile.dto';
import { UpdateStreamProfileDto } from './dto/update-stream-profile.dto';

export const MAX_STREAM_PROFILES = 20;

/** Given to every user the first time they list their presets. */
export const DEFAULT_STREAM_PROFILES: ReadonlyArray<Omit<CreateStreamProfileDto, 'engine'> & { engine: 'builtin' }> = [
  { name: '1080p 60', width: 1920, height: 1080, frameRate: 60, bitrateKbps: 12000, engine: 'builtin' },
  { name: '720p 60', width: 1280, height: 720, frameRate: 60, bitrateKbps: 8000, engine: 'builtin' },
  { name: '720p 30', width: 1280, height: 720, frameRate: 30, bitrateKbps: 5000, engine: 'builtin' },
];

@Injectable()
export class StreamProfilesService {
  constructor(
    @InjectRepository(StreamProfileEntity)
    private readonly profiles: Repository<StreamProfileEntity>,
  ) {}

  /** Lists the user's presets. A user with none gets the three defaults. */
  async list(userId: string): Promise<StreamProfileEntity[]> {
    const rows = await this.profiles.find({ where: { userId }, order: { createdAt: 'ASC' } });
    if (rows.length > 0) return rows;
    return this.profiles.save(DEFAULT_STREAM_PROFILES.map((preset) => this.profiles.create({ ...preset, userId })));
  }

  async create(userId: string, dto: CreateStreamProfileDto): Promise<StreamProfileEntity> {
    const count = await this.profiles.count({ where: { userId } });
    if (count >= MAX_STREAM_PROFILES) {
      throw new BadRequestException(`You can keep at most ${MAX_STREAM_PROFILES} stream profiles`);
    }
    return this.profiles.save(this.profiles.create({ ...dto, userId }));
  }

  async update(userId: string, id: string, dto: UpdateStreamProfileDto): Promise<StreamProfileEntity> {
    const profile = await this.findOwned(userId, id);
    Object.assign(profile, dto);
    return this.profiles.save(profile);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.profiles.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Stream profile not found');
  }

  /** Another user's profile gives the same 404 as a missing one, so IDs are never confirmed. */
  private async findOwned(userId: string, id: string): Promise<StreamProfileEntity> {
    const profile = await this.profiles.findOneBy({ id, userId });
    if (!profile) throw new NotFoundException('Stream profile not found');
    return profile;
  }
}
