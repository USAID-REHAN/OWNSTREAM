import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from './auth-user';

export const AUTH_CACHE_TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;

interface Entry {
  user: AuthUser;
  expiresAt: number;
}

/**
 * Remembers which user a token belongs to for 60 seconds, so Supabase is not asked on every request.
 * It only speeds up recognising a login; ownership and revocation checks always read the database.
 */
@Injectable()
export class AuthCache {
  private readonly entries = new Map<string, Entry>();

  get(token: string): AuthUser | undefined {
    const key = this.key(token);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.user;
  }

  set(token: string, user: AuthUser): void {
    if (this.entries.size >= MAX_ENTRIES) this.pruneExpired();
    this.entries.set(this.key(token), { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  }

  /** Forget every cached token of a user, for example after the account is deleted. */
  evictUser(userId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.user.id === userId) this.entries.delete(key);
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  private key(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
