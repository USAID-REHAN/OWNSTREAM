import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FindOperator, Repository } from 'typeorm';
import { DeviceEntity, GameEntity, StreamProfileEntity } from '../database/entities';
import { GamesService, MAX_GAMES } from './games.service';
import { launchTargetError } from './launch-target';
import { RawgService } from './rawg.service';

const HOST = '11111111-1111-4111-8111-111111111111';

describe('launch target checks', () => {
  it.each([
    ['steam', 'steam://rungameid/1259420'],
    ['epic', 'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'],
    ['epic', 'C:\\Users\\Usaid\\Desktop\\Fortnite.lnk'],
    ['exe', 'C:\\Games\\Mafia\\game.exe'],
    ['command', '"C:\\Games\\Tool\\run.exe" --windowed'],
  ] as const)('accepts a valid %s target', (launch, target) => {
    expect(launchTargetError(launch, target)).toBeNull();
  });

  it.each([
    ['steam', 'steam://install/1259420'],
    ['steam', 'https://store.steampowered.com/app/1259420'],
    ['exe', 'game.exe'],
    ['exe', 'C:\\Games\\..\\Windows\\System32\\cmd.exe'],
    ['exe', 'C:\\Games\\Mafia\\game.bat'],
    ['epic', 'https://example.com/fortnite'],
    ['command', '   '],
    ['command', 'start game\r\ndel C:\\important'],
  ] as const)('refuses an invalid %s target: %s', (launch, target) => {
    expect(launchTargetError(launch, target)).not.toBeNull();
  });
});

describe('GamesService', () => {
  let games: { find: jest.Mock; findOneBy: jest.Mock; count: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let devices: { findOneBy: jest.Mock };
  let profiles: { findOneBy: jest.Mock };
  let rawg: { search: jest.Mock; detail: jest.Mock };
  let service: GamesService;

  beforeEach(() => {
    games = {
      find: jest.fn(async () => []),
      findOneBy: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn((d: Partial<GameEntity>) => ({ ...d })),
      save: jest.fn(async (d: Partial<GameEntity>) => ({ id: 'g1', ...d })),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    devices = { findOneBy: jest.fn(async () => ({ id: HOST })) };
    profiles = { findOneBy: jest.fn(async () => ({ id: 'p1' })) };
    rawg = {
      search: jest.fn(),
      detail: jest.fn(async () => ({
        rawgId: 3328,
        title: 'Days Gone',
        coverUrl: 'https://media.rawg.io/cover.jpg',
        released: '2019-04-26',
        description: 'Ride and survive.',
        genres: ['Action', 'Adventure'],
      })),
    };
    service = new GamesService(
      games as unknown as Repository<GameEntity>,
      devices as unknown as Repository<DeviceEntity>,
      profiles as unknown as Repository<StreamProfileEntity>,
      rawg as unknown as RawgService,
    );
  });

  it('copies title, cover, description and genres from RAWG once when adding a game', async () => {
    const game = await service.create('user-1', { rawgId: 3328, launch: 'steam', launchTarget: 'steam://rungameid/1259420' });

    expect(rawg.detail).toHaveBeenCalledWith(3328);
    expect(game).toMatchObject({ title: 'Days Gone', genres: ['Action', 'Adventure'], released: '2019-04-26', launch: 'steam' });
    expect(game).not.toHaveProperty('userId');
  });

  it('still adds the game by hand when RAWG is down and a title is given', async () => {
    rawg.detail.mockRejectedValue(new ServiceUnavailableException());

    const game = await service.create('user-1', { rawgId: 3328, title: 'Days Gone' });

    expect(game).toMatchObject({ title: 'Days Gone', rawgId: 3328, genres: [] });
  });

  it('needs a title when RAWG cannot help', async () => {
    rawg.detail.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.create('user-1', { rawgId: 3328 })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.create('user-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a launch target that does not match its type', async () => {
    await expect(service.create('user-1', { title: 'X', launch: 'exe', launchTarget: 'notepad' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(games.save).not.toHaveBeenCalled();
  });

  it("refuses another user's host or stream profile", async () => {
    devices.findOneBy.mockResolvedValueOnce(null);
    await expect(service.create('user-1', { title: 'X', hostDeviceId: HOST })).rejects.toBeInstanceOf(NotFoundException);
    profiles.findOneBy.mockResolvedValueOnce(null);
    await expect(service.create('user-1', { title: 'X', profileId: 'p2' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('limits the size of the library', async () => {
    games.count.mockResolvedValue(MAX_GAMES);
    await expect(service.create('user-1', { title: 'One more' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters the library by title, favourite, genre and host', async () => {
    await service.list('user-1', { q: '50%_off', favorite: true, genre: 'Action', hostDeviceId: HOST });

    const { where, order } = games.find.mock.calls[0][0];
    expect(where.userId).toBe('user-1');
    expect((where.title as FindOperator<string>).value).toBe('%50\\%\\_off%');
    expect(where.isFavorite).toBe(true);
    expect((where.genres as FindOperator<string[]>).value).toEqual(['Action']);
    expect(where.hostDeviceId).toBe(HOST);
    expect(order).toEqual({ isFavorite: 'DESC', title: 'ASC' });
  });

  it('checks a new launch target against the saved launch type', async () => {
    games.findOneBy.mockResolvedValue({ id: 'g1', userId: 'user-1', launch: 'steam', launchTarget: 'steam://rungameid/1' });

    await expect(service.update('user-1', 'g1', { launchTarget: 'C:\\Games\\x.exe' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', 'g1', { launch: 'exe', launchTarget: 'C:\\Games\\x.exe' })).resolves.toMatchObject({
      launch: 'exe',
      launchTarget: 'C:\\Games\\x.exe',
    });
  });

  it("returns 404 for another user's game", async () => {
    await expect(service.update('user-2', 'g1', { isFavorite: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('user-2', 'g1')).rejects.toBeInstanceOf(NotFoundException);
    expect(games.delete).toHaveBeenCalledWith({ id: 'g1', userId: 'user-2' });
  });
});

describe('RawgService', () => {
  const rawgWith = (key?: string) => new RawgService({ get: () => key } as unknown as ConfigService<never, true>);
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('maps search results and caches them', async () => {
    fetchSpy.mockResolvedValue(reply(200, { results: [{ id: 3328, name: 'Days Gone', background_image: 'https://c/x.jpg', released: '2019-04-26' }] }));
    const rawg = rawgWith('test-key');

    const first = await rawg.search('Days Gone');
    const second = await rawg.search('  days gone ');

    expect(first).toEqual([{ rawgId: 3328, title: 'Days Gone', coverUrl: 'https://c/x.jpg', released: '2019-04-26' }]);
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://api.rawg.io/api/games');
    expect(url.searchParams.get('search')).toBe('Days Gone');
    expect(url.searchParams.get('key')).toBe('test-key');
  });

  it('maps game details with genres', async () => {
    fetchSpy.mockResolvedValue(reply(200, { id: 1, name: 'Mafia', description_raw: 'Story', genres: [{ name: 'Action' }] }));

    await expect(rawgWith('k').detail(1)).resolves.toMatchObject({ title: 'Mafia', description: 'Story', genres: ['Action'] });
  });

  it('turns RAWG failures and a missing key into a clear 503', async () => {
    fetchSpy.mockResolvedValue(reply(500, {}));
    await expect(rawgWith('k').search('mafia')).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(rawgWith('k').search('other')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(rawgWith(undefined).search('mafia')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('gives 404 for a RAWG ID that does not exist', async () => {
    fetchSpy.mockResolvedValue(reply(404, {}));
    await expect(rawgWith('k').detail(999999999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
