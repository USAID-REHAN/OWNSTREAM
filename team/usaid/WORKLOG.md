# Work Log: M. Usaidullah Rehan (241815)

One entry per working day: what was done, which Jira cards, and which commits.

## Sun 22 Nov 2026

- Updated the proposal, implementation plan and design document to version 3 (SCRUM-23).
- Set up the monorepo: npm workspaces, TypeScript, ESLint, EditorConfig and the GitHub Actions CI workflow (SCRUM-24).
- Wrote the shared package: enums, realtime event names and the end to end encryption module with unit tests (SCRUM-39).
- Wrote the Neon and Supabase database schemas in `db/`.
- Wrote the server foundation: config validation, database connection, health check and security middleware (SCRUM-29), the Supabase token guard with a 60 second cache (SCRUM-30) and the profile endpoints (SCRUM-31).
- Created the whole-project Jira backlog and the Deliverable 3 sprint.

## Mon 23 Nov 2026

- Installed Docker Desktop with the WSL 2 backend and tested it.
- Moved Sunday's open Jira cards to Monday.
- Pushed Sunday's work to GitHub: monorepo setup, shared package and database schemas, server foundation.
- Added the team work log folders.

## Tue 24 Nov 2026

- Device token hashing with HMAC-SHA-256 and the server pepper, the device guard (`Authorization: Device <token>`) and `GET /api/host/device` (SCRUM-33).
- Pairing endpoints: `POST /api/host/pairing-code`, `GET /api/host/pairing-status/:code` and `POST /api/devices/pair`, with 10 minute codes, a host-only pairing secret, a one-time token handout and rate limits (SCRUM-32).
- Device list, rename and unpair: `GET`, `PATCH` and `DELETE /api/devices` (SCRUM-34). Unpairing revokes the token at once and tells the realtime gateway.
- Schema: `pairing_codes.secret_hash` and a unique index on `devices.token_hash`.
- Tested the full pairing flow against a local Postgres in Docker, including two polls at the same moment.
- Realtime gateway on `/realtime` (SCRUM-37): `host:hello` with the device token, `viewer:hello` with the Supabase token, heartbeats, `host:online` and `host:offline`, `mode:set` and `mode:changed`. Sockets that do not say hello within 10 seconds are closed.
- Offline check every 30 seconds: hosts with no heartbeat for 45 seconds are marked offline and their socket is closed (SCRUM-38).
- Encrypted relay (SCRUM-40): `e2e:hello` and `e2e:welcome`, then `chat:*` and `agent:step` forwarded unchanged and only between the owner's browser tab and their host. Channels close when either side leaves or the host leaves AI mode. Attempts on someone else's host go to the audit log.
- Conversations CRUD with metadata only, and `chat:purge` to the host when a conversation is deleted (SCRUM-41).
- Tested with real Socket.IO clients (host plus two users) and live against Postgres in Docker.
- Connected the server to the real Neon and Supabase projects; fixed the Supabase `profiles` grants; all 28 live checks pass.

## Wed 25 Nov 2026

- Games CRUD at `/api/games` with filters (title, favourite, genre, host) and launch target checks for steam, epic, exe and command (SCRUM-50).
- RAWG client: `GET /api/games/search` through the server, game details copied once when a game is added, results cached, and a manual fallback when RAWG is down (SCRUM-49).
- Agent tasks at `/api/agent-tasks` with the status flow queued, running, waiting_approval, done, failed and cancelled. Tasks are sent to the host one at a time when it is online in AI mode; unsafe workspace folders are refused (SCRUM-45).
- Approval flow: `agent:approval` from the host, approve, reject or cancel with `PATCH`, `agent:decision` to the host and `agent:finished` with the summary saved in Neon (SCRUM-46).
- Rules engine for session requests: allowed hours in the user's time zone, known networks, approval and idle timeout; broken rules refuse the session (SCRUM-48).
- 22 live checks against the real Neon, Supabase and RAWG pass, including the full approval flow with a paired host.

## Thu 26 Nov 2026

- Session control plane at `/api/sessions` (SCRUM-51): request with ownership, access rules and PC state checks, `session:request` to the PC with the game to launch, approve, reject and end over Socket.IO, history with length, averages and notes. One open session per PC; unanswered requests time out after 2 minutes.
- Telegram (SCRUM-54): link codes, the webhook with the secret header check, `/start`, `/status`, `/stop` and `/help`, and the alert sender for PC offline and online, new session, stream ended and AI task finished or waiting.
- Audit interceptor for rule changes, sessions, device rename and Telegram linking (SCRUM-55).
- Per-route rate limits for sessions, Telegram link codes, the webhook and account deletion, with abuse tests (SCRUM-56).
- Integration tests with Supertest against a real Postgres, and a CI job that runs them (SCRUM-57).
- Checked the Dockerfile, docker-compose.yml and render.yaml: the image builds, the container starts and answers the health check with the database up (SCRUM-58).
- 31 live checks against the real Neon and Supabase with a fake PC on the socket: 30 pass. The one left needs Telegram's API, which the home network blocks; it will be checked on Render.
- Jira cards: SCRUM-51, 54, 55, 56, 57, 58
