import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceEntity } from '../database/entities';
import { DeviceTokenService } from './device-token.service';

/** Device tokens are 43 characters; anything far longer is refused before hashing. */
const MAX_TOKEN_LENGTH = 128;

/**
 * Finds the paired host behind a device token. Used by the HTTP device guard and, later, by the
 * realtime gateway for host:hello. Never cached: an unpaired device is refused immediately.
 */
@Injectable()
export class DeviceAuthService {
  constructor(
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    private readonly tokens: DeviceTokenService,
  ) {}

  async authenticate(token: string | null | undefined): Promise<DeviceEntity | null> {
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    return this.devices.findOneBy({ tokenHash: this.tokens.hash(token), role: 'host' });
  }
}
