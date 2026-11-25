import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation';

const RAWG_API = 'https://api.rawg.io/api';
const TIMEOUT_MS = 5_000;
const SEARCH_TTL_MS = 10 * 60_000;
const DETAIL_TTL_MS = 24 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 300;
const MAX_DESCRIPTION = 5_000;

export interface RawgSearchResult {
  rawgId: number;
  title: string;
  coverUrl: string | null;
  released: string | null;
}

export interface RawgGameDetail extends RawgSearchResult {
  description: string | null;
  genres: string[];
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Small time-limited cache, so repeated searches do not spend the RAWG quota. */
class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.entries.size >= MAX_CACHE_ENTRIES) {
      // Drop the oldest entry (Map keeps insertion order).
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

interface RawgGameJson {
  id: number;
  name: string;
  background_image?: string | null;
  released?: string | null;
  description_raw?: string | null;
  genres?: { name: string }[];
}

/**
 * F3: talks to the RAWG games database from the server, so the API key never reaches the browser
 * (Implementation Plan section 13.1). Results are cached; failures become a clear 503 so the user
 * can still add a game by hand.
 */
@Injectable()
export class RawgService {
  private readonly logger = new Logger('RAWG');
  private readonly apiKey: string | undefined;
  private readonly searches = new TtlCache<RawgSearchResult[]>(SEARCH_TTL_MS);
  private readonly details = new TtlCache<RawgGameDetail>(DETAIL_TTL_MS);

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.apiKey = config.get('RAWG_API_KEY', { infer: true }) || undefined;
  }

  async search(query: string): Promise<RawgSearchResult[]> {
    const key = query.trim().toLowerCase();
    const cached = this.searches.get(key);
    if (cached) return cached;

    const body = await this.request<{ results?: RawgGameJson[] }>('/games', { search: query.trim(), page_size: '10' });
    const results = (body.results ?? []).map((g) => this.toSearchResult(g));
    this.searches.set(key, results);
    return results;
  }

  async detail(rawgId: number): Promise<RawgGameDetail> {
    const cached = this.details.get(String(rawgId));
    if (cached) return cached;

    const g = await this.request<RawgGameJson>(`/games/${rawgId}`, {});
    const detail: RawgGameDetail = {
      ...this.toSearchResult(g),
      description: g.description_raw ? g.description_raw.slice(0, MAX_DESCRIPTION) : null,
      genres: (g.genres ?? []).map((x) => x.name).slice(0, 10),
    };
    this.details.set(String(rawgId), detail);
    return detail;
  }

  private toSearchResult(g: RawgGameJson): RawgSearchResult {
    return {
      rawgId: g.id,
      title: g.name,
      coverUrl: g.background_image ?? null,
      released: g.released ?? null,
    };
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Game search is not set up on this server; add the game by hand');
    }
    const url = new URL(RAWG_API + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', this.apiKey);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
    } catch (err) {
      // Never log the URL: it contains the API key.
      this.logger.warn(`RAWG request failed: ${(err as Error).name}`);
      throw this.unavailable();
    }
    if (response.status === 404) throw new NotFoundException('Game not found on RAWG');
    if (!response.ok) {
      this.logger.warn(`RAWG answered ${response.status}`);
      throw this.unavailable();
    }
    return (await response.json()) as T;
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('RAWG is unavailable right now; add the game by hand');
  }
}
