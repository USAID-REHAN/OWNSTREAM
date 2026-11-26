import { bearer, startTestApp, TestApp } from './test-app';

/**
 * Abuse tests for the per-route rate limits (SCRUM-56). Each file starts its own server, so these
 * counters start at zero. Limits are per signed-in user, or per IP address on routes without login.
 */
describe('Rate limits', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  const statuses = async (count: number, send: () => Promise<{ status: number }>) => {
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push((await send()).status);
    return result;
  };

  it('answers 429 to 50 pairing code requests in a minute, after the first 5 (T17)', async () => {
    const result = await statuses(50, () => t.http.post('/api/host/pairing-code').send({ hostName: 'Spam PC' }));

    expect(result.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(result.slice(5).every((s) => s === 429)).toBe(true);
  });

  it('allows 10 code guesses a minute per user, and one user hitting the limit does not block another', async () => {
    const guesser = t.addUser();
    const result = await statuses(12, () => t.http.post('/api/devices/pair').set(bearer(guesser)).send({ code: '000000' }));

    expect(result.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(result.slice(10)).toEqual([429, 429]);
    await t.http.post('/api/devices/pair').set(bearer(t.addUser())).send({ code: '000000' }).expect(404);
  });

  it('allows 10 session requests a minute', async () => {
    const user = t.addUser();
    const result = await statuses(11, () =>
      t.http.post('/api/sessions').set(bearer(user)).send({ hostDeviceId: '00000000-0000-4000-8000-000000000000' }),
    );

    expect(result.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(result[10]).toBe(429);
  });

  it('allows 100 ordinary requests a minute per user', async () => {
    const user = t.addUser();
    const result = await statuses(101, () => t.http.get('/api/games').set(bearer(user)));

    expect(result.filter((s) => s === 200)).toHaveLength(100);
    expect(result[100]).toBe(429);
  });

  it('never rate limits the health check Render uses', async () => {
    const result = await statuses(120, () => t.http.get('/api/health'));
    expect(result.every((s) => s === 200)).toBe(true);
  });
});
