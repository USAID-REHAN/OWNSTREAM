# Ownstream: Deliverable 3 (backend)

Full Stack Web Development Lab, BSCS 5 A, Fall 2026. Backend finished Friday 27 November 2026; as the instructor asked,
the whole project is submitted together at the end of December.
Team: M. Usaidullah Rehan (241815) and M. Bilal (241914).

| | |
|---|---|
| GitHub repository | https://github.com/USAID-REHAN/OWNSTREAM |
| Jira board | https://ownstream.atlassian.net (space OWNSTREAM, key SCRUM, Sprint 1) |
| How to run | `README.md` (Node or Docker), database setup in `db/README.md` |
| Decisions made while building | `docs/CHANGES_AND_DECISIONS.md`, section 7 |
| API requests | `docs/postman` (Postman collection and its README) |

## What was asked, and where it is

| Requirement | Where to see it |
|---|---|
| Complete backend with the database connected | `apps/server` (NestJS). Neon Postgres holds the app data (12 tables, `db/neon_schema.sql`); Supabase holds logins and profiles. `GET /api/health` answers `{"status":"ok","db":"up"}` when the database is reached. |
| Every task on Jira and assigned | Sprint 1 has 43 tasks, each assigned (Usaid 26, Bilal 17), under 18 epics. `docs/JIRA_COMMIT_MAP.md` links every card to its commits. |
| Daily GitHub pushes by both members | Every commit starts with its Jira key. Both members pushed on every working day, from their own accounts (table below). |
| Instructor added to the repository and Jira | GitHub collaborator Obaidullah704 (invitation accepted) and the Jira space (SCRUM-25). |

### Pushes per day

| Day | Usaid | Bilal |
|---|---|---|
| Mon 23 Nov | 4 commits: monorepo and CI, shared encryption module and schemas, server foundation with login guard and profile, work logs | 2 commits: stream profiles, work log |
| Tue 24 Nov | 7 commits: device tokens, pairing, device list and unpair, realtime gateway with offline check, encrypted relay, conversations, Supabase grants | 3 commits: personas with starter personas, Postman collection, work log |
| Wed 25 Nov | 3 commits: games and RAWG, agent tasks and approvals, rules engine | 3 commits: access rules, alert rules, Postman for F3, F8, F9, F10 |
| Thu 26 Nov | 6 commits: sessions, Telegram, audit log, rate limits, integration tests, Docker check | 1 commit: README |
| Fri 27 Nov | Integration test setup message, this summary | Postman for sessions and Telegram, Jira commit map, work log |

## What the backend does

All routes start with `/api` and need a Supabase login unless noted. The full list is in `README.md`.

| Module | What it covers |
|---|---|
| F1 Account | Profile read and edit, account deletion that removes every Neon row and the Supabase login |
| F2 Devices and pairing | Six digit pairing codes with a host-only secret, one-time device token (stored only as an HMAC hash), device list, rename, unpair with instant token revoke |
| F3 Games | Game library with RAWG search through the server (cached, with a manual fallback) and launch target checks |
| F4 Stream profiles | Resolution, frame rate and bitrate presets, three defaults |
| F5 Sessions | Session requests checked for ownership, access rules and PC state; the PC approves and launches the game; history with length, averages and notes |
| F6 Conversations | Chat metadata only; message text stays on the home PC |
| F7 Personas | System prompt and creativity presets, three starters |
| F8 Agent tasks | Status flow, one task at a time per PC, approval of write and script steps |
| F9 Alerts and Telegram | Alert rules, Telegram linking with one-time codes, the webhook with its secret header, bot commands and alerts |
| F10 Access rules | Allowed hours, approval on the PC, idle timeout and known networks, checked before every session |
| Realtime (`/realtime`) | Host and browser sign in, heartbeats and presence, mode switch, the encrypted chat relay (the server only forwards ciphertext), agent and session events |

### Security the server enforces

- Every query filters by the logged-in user, so another user's record always answers 404 (tested with two accounts).
- Validation refuses unknown fields; Helmet, CORS limited to the website address, and rate limits per user (429 when exceeded).
- Device tokens are random and stored only as an HMAC hash with a server-side pepper; unpairing drops the live socket at once.
- Socket events are checked against device and session ownership; refused attempts go to the audit log.
- Pairing, unpairing, session start and end, refused sessions, rule changes, Telegram linking and account deletion are written to the audit log.
- The Telegram webhook refuses any call without the secret header. The Supabase service key exists only on the server.

## Tests

| Kind | Result |
|---|---|
| Unit tests (Jest) | 214 tests in 22 suites, all passing |
| Integration tests (Jest and Supertest) | 13 tests: the whole server against a real Postgres built from the schema, covering tests T03, T04, T15, T16 and T17 from the test plan |
| CI (GitHub Actions) | On every push: lint, unit tests, build, integration tests with a Postgres service, and the Docker image build |
| Live checks | Each day the new features were also run against the real Neon and Supabase projects, with a simulated home PC on the socket for the realtime features |
| Docker | The server image builds and runs with `docker compose up --build` (checked on Usaid's PC; SCRUM-62 checks it on Bilal's PC) |
| Postman | 54 requests in `docs/postman`, run against the server |
| Deployed server | Running on Render at https://ownstream-server.onrender.com with the Neon database. A test PC on the socket triggered all four Telegram alerts (PC online, session started, stream ended, PC offline) and each reached a phone. Telegram is blocked on the development network, so this is checked on Render (SCRUM-88). |

## Not in this deliverable

- The React website and the Windows host app are the next sprints (Jira SCRUM-66 onward). Until then, the API is used through Postman and the tests.
- Game streaming is the bonus module and comes last.
