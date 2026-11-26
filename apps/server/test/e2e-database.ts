/**
 * Where the integration tests keep their data: a database named ownstream_e2e on a LOCAL Postgres
 * (the docker compose one, or the CI service). It is dropped and rebuilt from db/neon_schema.sql
 * before every run, so it must never point at Neon.
 */
export const E2E_DB_NAME = 'ownstream_e2e';

export function adminDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL ?? 'postgresql://ownstream:ownstream@localhost:5432/ownstream';
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Integration tests only run against a local Postgres, not ${host}`);
  }
  return url;
}

export function e2eDatabaseUrl(): string {
  const url = new URL(adminDatabaseUrl());
  url.pathname = `/${E2E_DB_NAME}`;
  return url.toString();
}
