// Value lists mirror the Postgres enums in db/neon_schema.sql. Keep both in sync.

export const DEVICE_ROLES = ['host', 'viewer'] as const;
export type DeviceRole = (typeof DEVICE_ROLES)[number];

export const APP_MODES = ['streaming', 'ai'] as const;
export type AppMode = (typeof APP_MODES)[number];

export const STREAM_ENGINES = ['builtin', 'pro'] as const;
export type StreamEngine = (typeof STREAM_ENGINES)[number];

export const SESSION_STATUSES = ['requested', 'active', 'ended', 'failed', 'rejected'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const LAUNCH_TYPES = ['exe', 'steam', 'epic', 'command'] as const;
export type LaunchType = (typeof LAUNCH_TYPES)[number];

export const TASK_STATUSES = ['queued', 'running', 'waiting_approval', 'done', 'failed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ALERT_EVENTS = [
  'host_offline',
  'host_online',
  'new_device_session',
  'stream_ended',
  'ai_task_finished',
  'ai_task_waiting_approval',
] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

export const ACCESS_RULE_TYPES = ['require_approval', 'allowed_hours', 'idle_timeout', 'block_unknown_network'] as const;
export type AccessRuleType = (typeof ACCESS_RULE_TYPES)[number];

export const AGENT_TOOLS = ['list_files', 'read_file', 'write_note', 'run_script'] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];
