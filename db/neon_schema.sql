-- Ownstream main application database (Neon PostgreSQL).
-- Run once on an empty database: in the Neon SQL editor on both branches (main and dev),
-- or with psql. docker-compose.yml also runs it when the local Postgres container is first created.
-- Every table stores the Supabase user id as a plain uuid (user_id). The two databases never join.

create type device_role as enum ('host', 'viewer');
create type app_mode as enum ('streaming', 'ai');
create type stream_engine as enum ('builtin', 'pro');
create type session_status as enum ('requested', 'active', 'ended', 'failed', 'rejected');
create type launch_type as enum ('exe', 'steam', 'epic', 'command');
create type task_status as enum ('queued', 'running', 'waiting_approval', 'done', 'failed', 'cancelled');
create type alert_event as enum ('host_offline', 'host_online', 'new_device_session', 'stream_ended', 'ai_task_finished', 'ai_task_waiting_approval');
create type access_rule_type as enum ('require_approval', 'allowed_hours', 'idle_timeout', 'block_unknown_network');

-- F2 devices
create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  role device_role not null default 'host',
  token_hash text,
  os text,
  is_online boolean not null default false,
  current_mode app_mode not null default 'ai',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index devices_user_idx on devices (user_id);

-- F2 pairing codes (created by the host, claimed by the user)
create table pairing_codes (
  id uuid primary key default gen_random_uuid(),
  code char(6) not null unique,
  host_name text not null,
  host_os text,
  expires_at timestamptz not null,
  claimed_by_user uuid,
  device_id uuid references devices (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- F4 stream profiles
create table stream_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  width int not null default 1920 check (width between 640 and 3840),
  height int not null default 1080 check (height between 360 and 2160),
  frame_rate int not null default 60 check (frame_rate between 15 and 120),
  bitrate_kbps int not null default 12000 check (bitrate_kbps between 1000 and 60000),
  engine stream_engine not null default 'builtin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stream_profiles_user_idx on stream_profiles (user_id);

-- F3 games
create table games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  host_device_id uuid references devices (id) on delete set null,
  title text not null,
  rawg_id int,
  cover_url text,
  description text,
  genres text[] not null default '{}',
  released date,
  launch launch_type not null default 'exe',
  launch_target text,
  profile_id uuid references stream_profiles (id) on delete set null,
  is_favorite boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_user_idx on games (user_id);

-- F5 stream sessions
create table stream_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  host_device_id uuid not null references devices (id) on delete cascade,
  game_id uuid references games (id) on delete set null,
  profile_id uuid references stream_profiles (id) on delete set null,
  engine stream_engine not null default 'builtin',
  status session_status not null default 'requested',
  started_at timestamptz,
  ended_at timestamptz,
  avg_fps numeric(5,1),
  avg_latency_ms int,
  note text,
  created_at timestamptz not null default now()
);
create index stream_sessions_user_idx on stream_sessions (user_id, created_at desc);

-- F7 personas
create table personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  system_prompt text not null,
  creativity numeric(2,1) not null default 0.7 check (creativity between 0 and 1.5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personas_user_idx on personas (user_id);

-- F6 conversations (message text stays on the home PC)
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  host_device_id uuid references devices (id) on delete cascade,
  persona_id uuid references personas (id) on delete set null,
  title text not null default 'New chat',
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_idx on conversations (user_id, updated_at desc);

-- F8 agent tasks
create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  host_device_id uuid not null references devices (id) on delete cascade,
  title text not null,
  instruction text not null,
  allowed_tools text[] not null default '{read_file}',
  workspace_folder text not null,
  status task_status not null default 'queued',
  result_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index agent_tasks_user_idx on agent_tasks (user_id, created_at desc);

-- F9 alert rules
create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event alert_event not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, event)
);

-- F10 access rules
create table access_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rule_type access_rule_type not null,
  settings jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index access_rules_user_idx on access_rules (user_id);

-- F9 Telegram link codes (one time, valid for 10 minutes)
create table telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code char(6) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Security log (read only for users)
create table audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  entity text,
  entity_id text,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_log_user_idx on audit_log (user_id, created_at desc);

-- access_rules.settings examples:
--   allowed_hours     {"start": "08:00", "end": "23:00"}
--   idle_timeout      {"minutes": 30}
--   require_approval  {"enabled": true}
