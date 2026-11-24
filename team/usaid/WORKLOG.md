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
