import { HELP_TEXT } from '../src/telegram/telegram.service';
import { bearer, startTestApp, TestApp, TestUser } from './test-app';

/**
 * Integration tests (SCRUM-57): real HTTP requests through the whole server (guards, validation,
 * services, audit) into a real Postgres built from db/neon_schema.sql. Only Supabase login is faked.
 * Test numbers refer to the test plan in the Implementation Plan (section 16).
 */
describe('Ownstream API with two accounts', () => {
  let t: TestApp;
  let a: TestUser;
  let b: TestUser;
  let hostId: string;

  /** HH:MM in Karachi, `hours` from now. */
  const karachiTime = (hours: number) => {
    const d = new Date(Date.now() + hours * 3_600_000);
    return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  beforeAll(async () => {
    t = await startTestApp();
    a = t.addUser();
    b = t.addUser();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('answers health without login and refuses everything else without a valid token', async () => {
    await t.http.get('/api/health').expect(200);
    await t.http.get('/api/games').expect(401);
    await t.http.get('/api/games').set('Authorization', 'Bearer made-up').expect(401);
    await t.http.get('/api/games').set(bearer(a)).expect(200, []);
  });

  it('refuses fields the API does not know about', async () => {
    const res = await t.http.post('/api/games').set(bearer(a)).send({ title: 'Mafia', userId: b.id }).expect(400);
    expect(JSON.stringify(res.body)).toContain('userId should not exist');
  });

  it('pairs a host; a code works only once (T03) and the token is handed out only once', async () => {
    const created = await t.http.post('/api/host/pairing-code').send({ hostName: 'Desk PC', hostOs: 'Windows 11' }).expect(201);
    const { code, pairingSecret } = created.body as { code: string; pairingSecret: string };

    await t.http.post('/api/devices/pair').set(bearer(a)).send({ code }).expect(201);
    await t.http.post('/api/devices/pair').set(bearer(b)).send({ code }).expect(404);

    const pickup = await t.http.get(`/api/host/pairing-status/${code}`).set('X-Pairing-Secret', pairingSecret).expect(200);
    expect(pickup.body).toMatchObject({ status: 'paired', deviceId: expect.any(String), deviceToken: expect.any(String) });
    hostId = pickup.body.deviceId;
    await t.http.get(`/api/host/pairing-status/${code}`).set('X-Pairing-Secret', pairingSecret).expect(410);
    await t.http.get(`/api/host/pairing-status/${code}`).set('X-Pairing-Secret', 'wrong').expect(404);
  });

  it('refuses an expired pairing code (T04)', async () => {
    const created = await t.http.post('/api/host/pairing-code').send({ hostName: 'Old PC' }).expect(201);
    await t.db.query(`UPDATE pairing_codes SET expires_at = now() - interval '1 minute' WHERE code = $1`, [created.body.code]);

    await t.http.post('/api/devices/pair').set(bearer(a)).send({ code: created.body.code }).expect(404);
  });

  it("gives 404 for every record of another account (T16, security checklist item 2)", async () => {
    const records = {
      games: (await t.http.post('/api/games').set(bearer(a)).send({ title: 'Days Gone', launch: 'steam', launchTarget: 'steam://rungameid/1259420' }).expect(201)).body,
      'stream-profiles': (await t.http.post('/api/stream-profiles').set(bearer(a)).send({ name: '4K 30', width: 3840, height: 2160, frameRate: 30 }).expect(201)).body,
      personas: (await t.http.post('/api/personas').set(bearer(a)).send({ name: 'Helper', systemPrompt: 'Be brief.' }).expect(201)).body,
      conversations: (await t.http.post('/api/conversations').set(bearer(a)).send({ hostDeviceId: hostId, title: 'Chat' }).expect(201)).body,
      'agent-tasks': (await t.http.post('/api/agent-tasks').set(bearer(a)).send({ hostDeviceId: hostId, title: 'Tidy', instruction: 'Sort notes', workspaceFolder: 'D:\\Notes' }).expect(201)).body,
      'alert-rules': (await t.http.post('/api/alert-rules').set(bearer(a)).send({ event: 'host_offline' }).expect(201)).body,
      devices: { id: hostId },
    } as Record<string, { id: string }>;

    // A valid change for each module, so only the ownership check can refuse it.
    const edits: Record<string, object> = {
      games: { notes: 'mine now' },
      'stream-profiles': { frameRate: 60 },
      personas: { name: 'Mine' },
      conversations: { title: 'Mine' },
      'agent-tasks': { action: 'cancel' },
      'alert-rules': { enabled: false },
      devices: { name: 'Mine' },
    };
    for (const [path, record] of Object.entries(records)) {
      const list = await t.http.get(`/api/${path}`).set(bearer(b)).expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).not.toContain(record.id);
      await t.http.patch(`/api/${path}/${record.id}`).set(bearer(b)).send(edits[path]).expect(404);
      await t.http.delete(`/api/${path}/${record.id}`).set(bearer(b)).expect(404);
      // The same change works for the owner, so the 404 above really was the ownership check.
      await t.http.patch(`/api/${path}/${record.id}`).set(bearer(a)).send(edits[path]).expect(200);
    }
    // The records are all still there for their owner.
    await t.http.get('/api/games').set(bearer(a)).expect(200).expect((res) => expect(res.body).toHaveLength(1));
    await t.http.get('/api/devices').set(bearer(a)).expect(200).expect((res) => expect(res.body).toHaveLength(1));

    // Another account cannot start a session on this PC or with this game.
    await t.http.post('/api/sessions').set(bearer(b)).send({ hostDeviceId: hostId }).expect(404);
    await t.http.post('/api/sessions').set(bearer(a)).send({ hostDeviceId: hostId, gameId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  it('refuses a session outside the allowed hours with a clear message (T15)', async () => {
    const rule = await t.http
      .post('/api/access-rules')
      .set(bearer(a))
      .send({ ruleType: 'allowed_hours', settings: { start: karachiTime(2), end: karachiTime(3) } })
      .expect(201);

    const refused = await t.http.post('/api/sessions').set(bearer(a)).send({ hostDeviceId: hostId }).expect(403);
    expect(refused.body.message).toMatch(/allowed/i);

    // With the rule gone, the request gets as far as the PC, which is not connected in this test.
    await t.http.delete(`/api/access-rules/${rule.body.id}`).set(bearer(a)).expect(204);
    const offline = await t.http.post('/api/sessions').set(bearer(a)).send({ hostDeviceId: hostId }).expect(409);
    expect(offline.body.message).toBe('Your PC is offline');
    await t.http.get('/api/sessions').set(bearer(a)).expect(200, []);
  });

  it('writes pairing, rule changes and refusals to the audit log, with the record ID', async () => {
    const rows: Array<{ action: string; entity_id: string | null }> = await t.db.query(
      'SELECT action, entity_id FROM audit_log WHERE user_id = $1 ORDER BY id',
      [a.id],
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(['device.pair_claimed', 'device.paired', 'alert_rule.created', 'access_rule.created', 'access_rule.deleted', 'session.refused']),
    );
    expect(rows.find((r) => r.action === 'device.paired')?.entity_id).toBe(hostId);
    // Failed calls by the other account were not logged as changes.
    const other: Array<{ action: string }> = await t.db.query('SELECT action FROM audit_log WHERE user_id = $1', [b.id]);
    expect(other.map((r) => r.action)).not.toContain('alert_rule.deleted');
  });

  it('accepts Telegram updates only with the webhook secret', async () => {
    const update = { update_id: 1, message: { text: '/help', chat: { id: 42, type: 'private' } } };
    await t.http.post('/api/telegram/webhook').send(update).expect(401);
    await t.http.post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'wrong').send(update).expect(401);
    await t.http
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'e2e-webhook-secret')
      .send(update)
      .expect(200, { method: 'sendMessage', chat_id: 42, text: HELP_TEXT });
    // No bot token in the tests, so link codes are refused cleanly.
    await t.http.post('/api/telegram/link-code').set(bearer(a)).expect(503);
  });
});
