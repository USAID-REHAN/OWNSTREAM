import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EnvironmentVariables } from '../config/env.validation';

/**
 * Creates and hashes device tokens and pairing secrets.
 * Only HMAC-SHA-256 hashes (keyed with DEVICE_TOKEN_PEPPER) are stored, so a copy of the
 * database alone is not enough to use or check a token.
 */
@Injectable()
export class DeviceTokenService {
  private readonly pepper: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.pepper = config.get('DEVICE_TOKEN_PEPPER', { infer: true });
  }

  /** 32 random bytes as base64url (43 characters). */
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(secret: string): string {
    return createHmac('sha256', this.pepper).update(secret, 'utf8').digest('hex');
  }

  /** Constant-time check of a secret against a stored hash. */
  matches(secret: string, storedHash: string): boolean {
    const actual = Buffer.from(this.hash(secret), 'hex');
    const expected = Buffer.from(storedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
