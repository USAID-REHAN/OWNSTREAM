import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DeviceEntity } from '../database/entities';
import { DeviceAuthService } from './device-auth.service';
import { DeviceTokenService } from './device-token.service';

const withPepper = (pepper: string) =>
  new DeviceTokenService({ get: () => pepper } as unknown as ConfigService<never, true>);

describe('DeviceTokenService', () => {
  const tokens = withPepper('pepper-one-0123456789');

  it('creates long, random, URL safe tokens', () => {
    const a = tokens.generate();
    const b = tokens.generate();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toEqual(b);
  });

  it('hashes with the pepper, so the same token hashes differently on another server', () => {
    const token = tokens.generate();

    expect(tokens.hash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(token)).toEqual(tokens.hash(token));
    expect(withPepper('pepper-two-0123456789').hash(token)).not.toEqual(tokens.hash(token));
  });

  it('matches only the right secret', () => {
    const secret = tokens.generate();
    const stored = tokens.hash(secret);

    expect(tokens.matches(secret, stored)).toBe(true);
    expect(tokens.matches(tokens.generate(), stored)).toBe(false);
    expect(tokens.matches(secret, 'not-a-hash')).toBe(false);
  });
});

describe('DeviceAuthService', () => {
  const tokens = withPepper('pepper-one-0123456789');
  let findOneBy: jest.Mock;
  let auth: DeviceAuthService;

  beforeEach(() => {
    findOneBy = jest.fn(async () => null);
    auth = new DeviceAuthService({ findOneBy } as unknown as Repository<DeviceEntity>, tokens);
  });

  it('looks a host up by the hash of its token, never the token itself', async () => {
    const token = tokens.generate();
    const device = { id: 'd1' } as DeviceEntity;
    findOneBy.mockResolvedValue(device);

    await expect(auth.authenticate(token)).resolves.toBe(device);
    expect(findOneBy).toHaveBeenCalledWith({ tokenHash: tokens.hash(token), role: 'host' });
  });

  it('refuses missing and oversized tokens without a database query', async () => {
    await expect(auth.authenticate(undefined)).resolves.toBeNull();
    await expect(auth.authenticate('')).resolves.toBeNull();
    await expect(auth.authenticate('x'.repeat(500))).resolves.toBeNull();
    expect(findOneBy).not.toHaveBeenCalled();
  });
});
