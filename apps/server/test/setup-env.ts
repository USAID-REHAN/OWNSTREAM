import { e2eDatabaseUrl } from './e2e-database';

/**
 * Every setting the server reads, set before the app starts. Values in process.env win over
 * apps/server/.env, so the integration tests never reach Neon, Supabase, RAWG or Telegram.
 */
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3999',
  PUBLIC_WEB_URL: 'http://localhost:5173',
  NEON_DATABASE_URL: e2eDatabaseUrl(),
  DB_SSL: 'false',
  SUPABASE_URL: 'http://supabase.invalid',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  RAWG_API_KEY: '',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_WEBHOOK_SECRET: 'e2e-webhook-secret',
  DEVICE_TOKEN_PEPPER: 'e2e-device-token-pepper',
  STUN_URLS: 'stun:stun.l.google.com:19302',
  TURN_URL: '',
  TURN_USERNAME: '',
  TURN_CREDENTIAL: '',
});
