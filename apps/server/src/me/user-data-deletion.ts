export interface DeleteStep {
  table: string;
  sql: string;
}

const byUser = (table: string): DeleteStep => ({ table, sql: `DELETE FROM ${table} WHERE user_id = $1` });

/**
 * Removes every Neon row that belongs to a user ($1), children before parents so that no
 * foreign key is left pointing at a deleted row. Runs inside one transaction.
 */
export const USER_DATA_DELETE_STEPS: readonly DeleteStep[] = [
  byUser('stream_sessions'),
  byUser('agent_tasks'),
  byUser('conversations'),
  byUser('games'),
  {
    table: 'pairing_codes',
    sql: 'DELETE FROM pairing_codes WHERE claimed_by_user = $1 OR device_id IN (SELECT id FROM devices WHERE user_id = $1)',
  },
  byUser('personas'),
  byUser('stream_profiles'),
  byUser('devices'),
  byUser('alert_rules'),
  byUser('access_rules'),
  byUser('telegram_link_codes'),
  byUser('audit_log'),
];
