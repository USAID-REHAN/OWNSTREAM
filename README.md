# Ownstream

**Your PC. Your games. Your AI. Anywhere.**

Ownstream turns a home gaming PC into a private personal server. From a lighter laptop anywhere, the user can:

- **Chat with a local AI** (Qwen on Ollama, running on the home PC) and run small, approved agent tasks. Chat is encrypted end to end, so the server only relays ciphertext. This is the core deliverable.
- **Stream their own games** from the home PC. This is the bonus module.

Full Stack Web Development Lab, BSCS 5 A, Fall 2026. Team: M. Usaidullah Rehan (241815) and M. Bilal (241914).

## Repository layout

| Path | What it is |
|---|---|
| `apps/server` | NestJS API and realtime gateway (deployed to Render) |
| `apps/server/test` | Integration tests: the whole server against a local Postgres |
| `packages/shared` | Types, constants and the end-to-end encryption helpers used by every app |
| `db` | SQL schemas for Neon (app data) and Supabase (users) |
| `docs` | Proposal, Implementation Plan, Requirements and Design document (version 3), decisions log and the Postman collection |
| `.github` | CI workflow and pull request template |

The React website (`apps/web`) and the Windows host app (`apps/host`) come in later sprints.

## Run the server locally

You need Node.js 22 or newer.

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```
2. Run the schemas in `db/` on Neon and Supabase (see `db/README.md`).
3. Copy `apps/server/.env.example` to `apps/server/.env` and fill in the values (see the table below).
4. Build the shared package, then start the server in watch mode:
   ```bash
   npm run build:shared
   npm run dev:server
   ```
5. Open http://localhost:3000/api/health. It should return `{"status":"ok","db":"up"}`.

### With Docker

With Docker Desktop installed, this starts a local Postgres (with the Neon schema) and the server together:

```bash
docker compose up --build
```

The server still reads `apps/server/.env` for Supabase and the other keys, but uses the local database instead of Neon.
To start again from an empty database, run `docker compose down -v` and then `docker compose up --build`.

## Environment variables

Set in `apps/server/.env` locally and in the Render dashboard in production. Never commit real values.

| Variable | Needed | What it is |
|---|---|---|
| `PORT` | yes | Port the server listens on (3000 locally; Render sets its own) |
| `NODE_ENV` | yes | `development`, `production` or `test` |
| `PUBLIC_WEB_URL` | yes | The website's address. CORS and Socket.IO accept only this origin |
| `NEON_DATABASE_URL` | yes | Neon pooled connection string |
| `DB_SSL` | yes | `true` for Neon, `false` for the local Docker database |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | no | Public key the website uses to log in (the server does not need it) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Secret server key. Never put it in the website or the host app |
| `DEVICE_TOKEN_PEPPER` | yes | Long random secret mixed into every device token hash (at least 16 characters) |
| `RAWG_API_KEY` | no | Game search. Without it, games are added by title |
| `TELEGRAM_BOT_TOKEN` | no | Bot token from BotFather. Without it, Telegram linking and alerts are off |
| `TELEGRAM_WEBHOOK_SECRET` | with Telegram | Random string; Telegram must send it with every webhook call |
| `STUN_URLS`, `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | no | WebRTC help servers for the bonus streaming module |

## API endpoints

All routes start with `/api`. Every route needs `Authorization: Bearer <Supabase access token>` unless the table says otherwise.
Another user's record always answers 404. Ready-made requests are in `docs/postman` (see its README).

| Module | Method and path | What it does |
|---|---|---|
| Health | `GET /health` | Server and database check (no login) |
| F1 Profile | `GET /me`, `PATCH /me` | Read or change the display name and avatar |
| F1 Profile | `DELETE /me` | Delete the account and all its data |
| F2 Host app | `POST /host/pairing-code` | Host gets a six digit code and a pairing secret (no login) |
| F2 Host app | `GET /host/pairing-status/:code` | Host checks the code with `X-Pairing-Secret`; gets its device token once (no login) |
| F2 Host app | `GET /host/device` | Host checks its saved token (`Authorization: Device <token>`) |
| F2 Devices | `POST /devices/pair` | User types the code shown on the host |
| F2 Devices | `GET /devices`, `PATCH /devices/:id`, `DELETE /devices/:id` | List, rename, unpair (unpairing revokes the token at once) |
| F3 Games | `GET /games/search?q=` | Search RAWG through the server |
| F3 Games | `POST /games`, `GET /games`, `PATCH /games/:id`, `DELETE /games/:id` | Game library; `GET` filters by `q`, `favorite`, `genre`, `hostDeviceId` |
| F4 Stream profiles | `POST`, `GET /stream-profiles`, `PATCH`, `DELETE /stream-profiles/:id` | Resolution, frame rate and bitrate presets |
| F5 Sessions | `POST /sessions` | Ask the PC for a session: ownership, access rules, then the PC approves and launches the game |
| F5 Sessions | `GET /sessions`, `GET /sessions/:id` | History, filters `status`, `hostDeviceId`, `limit` |
| F5 Sessions | `PATCH /sessions/:id` | `{ "action": "end" }` ends it; `{ "note": "..." }` adds a note |
| F5 Sessions | `DELETE /sessions/:id` | Delete an ended session from the history |
| F6 Conversations | `POST`, `GET /conversations`, `PATCH`, `DELETE /conversations/:id` | Chat metadata only; message text stays on the home PC |
| F7 Personas | `POST`, `GET /personas`, `PATCH`, `DELETE /personas/:id` | System prompt and creativity presets |
| F8 Agent tasks | `POST`, `GET /agent-tasks`, `PATCH`, `DELETE /agent-tasks/:id` | Tasks for the local AI agent; `PATCH` with `approve`, `reject` or `cancel` |
| F9 Alert rules | `POST`, `GET /alert-rules`, `PATCH`, `DELETE /alert-rules/:id` | Which events send a Telegram alert |
| F9 Telegram | `POST /telegram/link-code` | One-time code (10 minutes) to send to the bot as `/start CODE` |
| F9 Telegram | `DELETE /telegram/link` | Stop alerts to the linked chat |
| F9 Telegram | `POST /telegram/webhook` | Called by Telegram; checked with the `X-Telegram-Bot-Api-Secret-Token` header (no login) |
| F10 Access rules | `POST`, `GET /access-rules`, `PATCH`, `DELETE /access-rules/:id` | Allowed hours, approval on the PC, idle timeout, known networks |

### Realtime events (Socket.IO namespace `/realtime`)

| Event | Direction | Meaning |
|---|---|---|
| `host:hello`, `viewer:hello` | Host or browser to server | Sign in with the device token or the Supabase token |
| `host:heartbeat`, `host:online`, `host:offline` | Host to server to browser | Live CPU, GPU, RAM and mode; presence |
| `mode:set`, `mode:changed` | Browser to host, host to browser | Switch between AI and streaming mode |
| `e2e:*`, `chat:*`, `agent:step`, `agent:log_fetch` | Browser and host, through the server | Encrypted chat and agent logs; the server never reads them |
| `agent:run`, `agent:approval`, `agent:decision`, `agent:finished` | Server and host | Agent tasks and their approval steps |
| `session:request`, `session:approve`, `session:reject`, `session:end`, `session:ready` | Server, host and browser | Session control |

### Rate limits

Per signed-in user (per IP address on routes without login), per minute: 100 for ordinary routes; 5 for pairing codes and
Telegram link codes; 10 for code claims and session requests; 30 for pairing status and game search; 3 for account
deletion. Over the limit the server answers 429.

## Tests

| Command | What it does |
|---|---|
| `npm test` | Builds the shared package, then runs every unit test |
| `npm run test:e2e` | Integration tests against a local Postgres: start it first with `docker compose up -d postgres` |
| `npm run lint` | Lints every workspace |
| `npm run build:server` | Compiles the server to `apps/server/dist` |

The integration tests build their own `ownstream_e2e` database from `db/neon_schema.sql` and refuse to run against
anything other than localhost, so they never touch Neon. CI runs the unit tests, the integration tests and the Docker
build on every push to `main`.

## Telegram bot

After the server is deployed, register the webhook once (replace the three values):

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_SERVER.onrender.com/api/telegram/webhook" \
  -d "secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET"
```

Bot commands: `/start CODE` links the chat, `/status` shows the PC and any session, `/stop` ends the session (asks to
confirm), `/help` lists them. Alerts are sent only for the events turned on in alert rules.

## Working method

Planning and task assignment happen on the Jira board (space OWNSTREAM, key SCRUM). Each commit starts with its Jira key,
for example `SCRUM-51 Add the session control plane`. Both members push their own work every day, and each keeps a work
log in `team/<name>/WORKLOG.md`.
