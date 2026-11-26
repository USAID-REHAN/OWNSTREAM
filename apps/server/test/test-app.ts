import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

export interface TestUser {
  id: string;
  token: string;
}

/**
 * Supabase stand-in: each test user gets a made-up access token. Everything else (guards,
 * validation, throttling, services, Postgres) is the real server.
 */
class FakeSupabase {
  readonly users = new Map<string, { id: string; email: string }>();

  readonly admin = {
    auth: {
      getUser: async (token: string) => {
        const user = this.users.get(token);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
    // Profiles live in Supabase; the tests that reach them get "no profile".
    from: () => {
      const builder = {
        select: () => builder,
        update: () => builder,
        eq: () => builder,
        neq: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      return builder;
    },
  };

  addUser(): TestUser {
    const user = { id: randomUUID(), token: `token-${randomUUID()}` };
    this.users.set(user.token, { id: user.id, email: `${user.id}@example.test` });
    return user;
  }
}

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  db: DataSource;
  addUser(): TestUser;
}

/** Starts the whole server the way main.ts does, against the local ownstream_e2e database. */
export async function startTestApp(): Promise<TestApp> {
  const supabase = new FakeSupabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseService)
    .useValue(supabase)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  await app.init();

  return {
    app,
    http: request(app.getHttpServer()),
    db: app.get(DataSource),
    addUser: () => supabase.addUser(),
  };
}

export const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
