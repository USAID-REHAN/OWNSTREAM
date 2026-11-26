import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { adminDatabaseUrl, E2E_DB_NAME, e2eDatabaseUrl } from './e2e-database';

async function withDatabase(url: string, work: (db: DataSource) => Promise<unknown>): Promise<void> {
  const db = new DataSource({ type: 'postgres', url, ssl: false });
  await db.initialize();
  try {
    await work(db);
  } finally {
    await db.destroy();
  }
}

/** Rebuilds the ownstream_e2e database from db/neon_schema.sql once before the integration tests. */
export default async function globalSetup(): Promise<void> {
  await withDatabase(adminDatabaseUrl(), async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${E2E_DB_NAME}`);
  });
  const schema = readFileSync(join(__dirname, '..', '..', '..', 'db', 'neon_schema.sql'), 'utf8');
  await withDatabase(e2eDatabaseUrl(), (db) => db.query(schema));
}
