import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { LaunchType } from '@ownstream/shared';
import { ArrayContains, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { DeviceEntity, GameEntity, StreamProfileEntity } from '../database/entities';
import { CreateGameDto, ListGamesQuery, UpdateGameDto } from './dto/game.dto';
import { launchTargetError } from './launch-target';
import { RawgSearchResult, RawgService } from './rawg.service';

export const MAX_GAMES = 500;

export interface GameView {
  id: string;
  title: string;
  rawgId: number | null;
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  released: string | null;
  launch: LaunchType;
  launchTarget: string | null;
  hostDeviceId: string | null;
  profileId: string | null;
  isFavorite: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toGameView(g: GameEntity): GameView {
  return {
    id: g.id,
    title: g.title,
    rawgId: g.rawgId,
    coverUrl: g.coverUrl,
    description: g.description,
    genres: g.genres,
    released: g.released,
    launch: g.launch,
    launchTarget: g.launchTarget,
    hostDeviceId: g.hostDeviceId,
    profileId: g.profileId,
    isFavorite: g.isFavorite,
    notes: g.notes,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

/** Escapes %, _ and \ so a search for "50%" matches the text, not a pattern. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** F3 game library. Every query is limited to the logged in user. */
@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(StreamProfileEntity) private readonly profiles: Repository<StreamProfileEntity>,
    private readonly rawg: RawgService,
  ) {}

  search(query: string): Promise<RawgSearchResult[]> {
    return this.rawg.search(query);
  }

  async list(userId: string, query: ListGamesQuery): Promise<GameView[]> {
    const where: FindOptionsWhere<GameEntity> = { userId };
    if (query.q) where.title = ILike(`%${escapeLike(query.q)}%`);
    if (query.favorite !== undefined) where.isFavorite = query.favorite;
    if (query.genre) where.genres = ArrayContains([query.genre]);
    if (query.hostDeviceId) where.hostDeviceId = query.hostDeviceId;
    const rows = await this.games.find({ where, order: { isFavorite: 'DESC', title: 'ASC' } });
    return rows.map(toGameView);
  }

  async create(userId: string, dto: CreateGameDto): Promise<GameView> {
    const count = await this.games.count({ where: { userId } });
    if (count >= MAX_GAMES) throw new BadRequestException(`Your library can hold at most ${MAX_GAMES} games`);
    if (dto.hostDeviceId) await this.assertOwnedDevice(userId, dto.hostDeviceId);
    if (dto.profileId) await this.assertOwnedProfile(userId, dto.profileId);

    const launch = dto.launch ?? 'exe';
    if (dto.launchTarget) this.assertLaunchTarget(launch, dto.launchTarget);

    let fromRawg: Partial<GameEntity> = {};
    if (dto.rawgId) {
      try {
        const d = await this.rawg.detail(dto.rawgId);
        fromRawg = {
          rawgId: d.rawgId,
          title: d.title,
          coverUrl: d.coverUrl,
          description: d.description,
          genres: d.genres,
          released: d.released,
        };
      } catch (err) {
        // RAWG down or over its limit: the game can still be added by hand (section 13.1).
        if (!dto.title) throw err;
        fromRawg = { rawgId: dto.rawgId };
      }
    }

    const title = dto.title ?? fromRawg.title;
    if (!title) throw new BadRequestException('Give a title, or a rawgId from the game search');

    const row = this.games.create({
      genres: [],
      ...fromRawg,
      userId,
      title,
      hostDeviceId: dto.hostDeviceId ?? null,
      launch,
      launchTarget: dto.launchTarget ?? null,
      profileId: dto.profileId ?? null,
      isFavorite: dto.isFavorite ?? false,
      notes: dto.notes ?? null,
    });
    return toGameView(await this.games.save(row));
  }

  async update(userId: string, id: string, dto: UpdateGameDto): Promise<GameView> {
    const game = await this.findOwned(userId, id);
    if (dto.hostDeviceId) await this.assertOwnedDevice(userId, dto.hostDeviceId);
    if (dto.profileId) await this.assertOwnedProfile(userId, dto.profileId);

    const launch = dto.launch ?? game.launch;
    const target = dto.launchTarget !== undefined ? dto.launchTarget : game.launchTarget;
    if (target) this.assertLaunchTarget(launch, target);

    if (dto.title !== undefined) game.title = dto.title;
    if (dto.hostDeviceId !== undefined) game.hostDeviceId = dto.hostDeviceId;
    if (dto.profileId !== undefined) game.profileId = dto.profileId;
    if (dto.isFavorite !== undefined) game.isFavorite = dto.isFavorite;
    if (dto.notes !== undefined) game.notes = dto.notes;
    game.launch = launch;
    game.launchTarget = target ?? null;
    return toGameView(await this.games.save(game));
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.games.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Game not found');
  }

  private assertLaunchTarget(launch: LaunchType, target: string): void {
    const error = launchTargetError(launch, target);
    if (error) throw new BadRequestException(error);
  }

  private async findOwned(userId: string, id: string): Promise<GameEntity> {
    const game = await this.games.findOneBy({ id, userId });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }

  private async assertOwnedDevice(userId: string, id: string): Promise<void> {
    if (!(await this.devices.findOneBy({ id, userId }))) throw new NotFoundException('Device not found');
  }

  private async assertOwnedProfile(userId: string, id: string): Promise<void> {
    if (!(await this.profiles.findOneBy({ id, userId }))) throw new NotFoundException('Stream profile not found');
  }
}
