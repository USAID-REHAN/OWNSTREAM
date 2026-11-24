import { validateEnv } from './env.validation';

const base = {
  PUBLIC_WEB_URL: 'http://localhost:5173',
  NEON_DATABASE_URL: 'postgresql://ownstream:ownstream@localhost:5432/ownstream',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  DEVICE_TOKEN_PEPPER: 'a-pepper-of-at-least-16-chars',
};

describe('validateEnv', () => {
  it('applies defaults and converts types', () => {
    const env = validateEnv({ ...base, PORT: '4000' });

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DB_SSL).toBe(true);
  });

  it('reads DB_SSL=false for the local Docker database', () => {
    expect(validateEnv({ ...base, DB_SSL: 'false' }).DB_SSL).toBe(false);
  });

  it('fails clearly when a required value is missing', () => {
    const { NEON_DATABASE_URL: _omit, ...withoutDb } = base;

    expect(() => validateEnv(withoutDb)).toThrow(/NEON_DATABASE_URL/);
  });

  it('requires a device token pepper of at least 16 characters', () => {
    const { DEVICE_TOKEN_PEPPER: _omit, ...withoutPepper } = base;

    expect(() => validateEnv(withoutPepper)).toThrow(/DEVICE_TOKEN_PEPPER/);
    expect(() => validateEnv({ ...base, DEVICE_TOKEN_PEPPER: 'short' })).toThrow(/DEVICE_TOKEN_PEPPER/);
  });
});
