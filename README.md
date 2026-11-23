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
| `packages/shared` | Types, constants and the end-to-end encryption helpers used by every app |
| `db` | SQL schemas for Neon (app data) and Supabase (users) |
| `docs` | Proposal, Implementation Plan and Requirements and Design document (version 3) |
| `.github` | CI workflow and pull request template |

The React website (`apps/web`) and the Windows host app (`apps/host`) come in later sprints.

## Run the server locally

You need Node.js 22 or newer.

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```
2. Copy `apps/server/.env.example` to `apps/server/.env` and fill in the Neon connection string and the Supabase URL and service role key. Run the schemas in `db/` first (see `db/README.md`).
3. Build the shared package, then start the server in watch mode:
   ```bash
   npm run build:shared
   npm run dev:server
   ```
4. Open http://localhost:3000/api/health. It should return `{"status":"ok","db":"up"}`.

With Docker Desktop installed you can also run a local database and the server together:

```bash
docker compose up --build
```

## Useful commands

| Command | What it does |
|---|---|
| `npm test` | Builds the shared package, then runs every test |
| `npm run lint` | Lints every workspace |
| `npm run build:server` | Compiles the server to `apps/server/dist` |

## Working method

Planning and task assignment happen on the Jira board (space OWNSTREAM, key SCRUM). Work goes on short branches named after the Jira key, for example `feature/SCRUM-12-device-pairing`, and is merged by pull request after the other member reviews it.
