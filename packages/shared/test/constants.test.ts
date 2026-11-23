import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import * as enums from '../src/enums';
import { RealtimeEvent } from '../src/realtime';

const schema = readFileSync(join(__dirname, '../../../db/neon_schema.sql'), 'utf8');

function sqlEnum(name: string): string[] {
  const match = schema.match(new RegExp(`create type ${name} as enum \\(([^)]*)\\)`, 'i'));
  assert.ok(match, `enum ${name} not found in db/neon_schema.sql`);
  return match[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('shared constants', () => {
  const pairs: Array<[string, readonly string[]]> = [
    ['device_role', enums.DEVICE_ROLES],
    ['app_mode', enums.APP_MODES],
    ['stream_engine', enums.STREAM_ENGINES],
    ['session_status', enums.SESSION_STATUSES],
    ['launch_type', enums.LAUNCH_TYPES],
    ['task_status', enums.TASK_STATUSES],
    ['alert_event', enums.ALERT_EVENTS],
    ['access_rule_type', enums.ACCESS_RULE_TYPES],
  ];

  for (const [name, values] of pairs) {
    it(`matches the ${name} enum in the Neon schema`, () => {
      assert.deepEqual([...values], sqlEnum(name));
    });
  }

  it('has unique realtime event names', () => {
    const names = Object.values(RealtimeEvent);
    assert.equal(new Set(names).size, names.length);
  });
});
