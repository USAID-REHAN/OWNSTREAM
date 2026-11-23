# Ownstream: corrected versions, what changed and why

These corrected documents are for the team's own use. The submitted versions stay as they are.

| Corrected file | Based on |
|---|---|
| `Ownstream_Proposal_v3.docx` / `.pdf` | `Ownstream_Proposal.docx` (clean Word source of the submitted proposal) |
| `Ownstream_Implementation_Plan_v3.docx` / `.pdf` | `Ownstream_Implementation_Plan.docx` |
| `Ownstream_Deliverable_2_v3.docx` / `.pdf` | `Ownstream_Deliverable_2.pdf` |

## 1. Team: two members

- **M. Usaidullah Rehan (241815)** and **M. Bilal (241914)** now build the project. Bilal's correct roll number is 241914.
- The Jira board is mandatory. Every task lives in Jira and is assigned to one of the two members. Every pull request is reviewed by the other member. The board is checked at two short stand-ups a week and at each sprint review.
- With two people, work is split into two lanes each sprint. Lane A is the Host app and the AI runtime. Lane B is the server, the database and the website. Lanes can swap at any time in Jira.

## 2. Scope: one consistent core and bonus split

**Core (graded, never cut):**
- All 10 CRUD modules, F1 to F10, as data, endpoints and screens.
- Local AI chat (F6), personas (F7) and agent tasks with approvals (F8).
- The mode guard and device pairing.
- The session *control plane* (F5): request a session, check access rules, get host approval, launch the game on the host, end the session, keep the history.
- The access rules engine (F10), RAWG (F3) and Telegram *alerts* (F9).
- Security, Docker, CI, Render deployment, Jira and the host installer.

**Bonus (the streaming *media plane*), attempted in this order:**
1. **B1 Pro mode**: Sunshine and Moonlight over Tailscale. Sunshine already does capture, encoding, audio and input, so this is the cheapest playable stream.
2. **B2 Built in mode video**: our own WebRTC pipeline.
3. **B3 Game audio** in Built in mode.
4. **B4 Keyboard and mouse input** in Built in mode.
5. **B5 Live quality change** and the stats overlay.
6. **B6 Telegram bot commands** (`/status`, `/stop`). Alerts stay core.
7. **B7 Controller support.**
8. **B8 Fortnite.**

If time runs short, bonus items are cut from the bottom up (B8 first). Core items are never cut.

Why this changed: the submitted proposal marked F3, F4, F5 and F9 as "Bonus", while its own scope table, the Implementation Plan's "never cut" list and the final checklist required all 10 CRUD modules plus RAWG and Telegram. Now "bonus" means only the live video, audio and input path. Every CRUD module is core.

## 3. AI chat no longer depends on WebRTC

**Problem:** in the submitted design, AI chat travelled over a WebRTC data channel. That made the core module depend on the signalling, STUN and TURN work scheduled in the bonus streaming sprints. It would also fail on networks where peer-to-peer connections cannot be made, such as university networks.

**Decision:** AI chat and agent-task logs travel through the Socket.IO connections that already exist. The browser connects to the server, and the host keeps an outbound connection to the server. Both payloads are end-to-end encrypted, so the server only relays ciphertext.

The handshake and encryption work like this:
- When the browser opens a host's AI page, it sends `e2e:hello` with a fresh ECDH P-256 public key, generated with WebCrypto. The host replies with `e2e:welcome` carrying its own fresh public key.
- Both sides derive an AES-GCM-256 key with HKDF-SHA-256. The salt is the channel ID the server assigns.
- Every message uses a new random 12-byte IV.
- The same code runs in the browser and in Node 22 (`globalThis.crypto.subtle`) and lives in `packages/shared/src/e2e.ts`.
- The host batches reply tokens about every 50 ms into one encrypted `chat:chunk`.

Privacy rules:
- The server never stores, logs or decrypts the payloads.
- Neon keeps only conversation metadata (title, model, persona).
- Message text stays in the host's local store.

Trust model:
- This trust model matches WebRTC's, where the DTLS fingerprints also pass through the signalling server.
- As an optional check, both sides show a 6-digit safety code derived from the two public keys, so the user can compare them.

Results:
- The core works wherever the host can reach the server.
- No STUN or TURN is needed for AI.
- The core is built and finished before any streaming work starts.
- WebRTC is now used only for bonus Built in streaming.

## 4. Sprint order: AI first

The calendar is still 14 weeks: Sprint 0, then six two-week sprints, then a final week.

| Sprint | Weeks | Goal |
|---|---|---|
| 0 | 1 | Foundation: repository, Jira board, CI, Docker, Neon, Supabase, Render "hello", keys, Ollama speed test |
| 1 | 2–3 | Accounts and devices: F1, F2, Host skeleton, realtime gateway, heartbeats |
| 2 | 4–5 | AI chat (core): Ollama service, encrypted relay, F6, F7, chat screen, mode machine |
| 3 | 6–7 | Agent and rules (core): F8 with approvals, F10 and its rules engine, audit log, Pause sharing |
| 4 | 8–9 | Games and sessions (core): F3 with RAWG, F4 presets, F5 control plane, dashboard |
| 5 | 10–11 | Alerts, hardening and release: F9 alerts, security checklist, tests, installer v1.0. **Core complete.** B1 Pro mode if time allows |
| 6 | 12–13 | Bonus streaming: B1 if not done yet, then B2 to B6 |
| Final | 14 | Demo, report, freeze |

## 5. Docker fix: website settings at runtime

**Problem:** Vite writes `import.meta.env.VITE_*` values into the JavaScript at *build* time. In the submitted plan, Docker Compose (`env_file`) and Render passed those values only to the *running* container. The website image was therefore built without its API address and Supabase keys.

**Fix:** the website reads its settings at runtime.
- `apps/web/public/env.js` contains `window.__OWNSTREAM_ENV__ = {}` and is loaded by `index.html` before the app.
- `src/lib/env.ts` reads `window.__OWNSTREAM_ENV__` first. In local `npm run dev` it falls back to `import.meta.env`.
- The website image starts with `docker-entrypoint.sh`. This script writes `dist/env.js` from the container's environment variables, then runs `serve -s dist -l ${PORT:-4173}`.
- `serve.json` marks `env.js` as `no-store` so browsers never cache old settings.
- One image now works locally, in CI and on Render. These values are public by design (the API URL and the Supabase anon key), so exposing them is safe. The service-role key stays on the server only.

Related corrections:
- The server listens on `process.env.PORT`, which Render sets.
- Database SSL is controlled by `DB_SSL`: `true` for Neon, `false` for the local Docker Postgres.
- The unused `LOCAL_DATABASE_URL` variable was removed.
- The wording "the exact CI image runs in production" was changed to "Render builds from the same Dockerfile". Render builds its own image from that Dockerfile.

## 6. Other fixes

- Added a `telegram_link_codes` table. The submitted schema had a link-code endpoint but no table to store the codes.
- Added `ai_task_waiting_approval` to the `alert_event` enum. The plan already promised a Telegram alert when an agent task waits for approval, but the enum had no value for it.
- Added `agent:log_fetch`. If no browser is open while an agent task runs, its log stays on the host. When the agent page opens later, the browser asks for the log and the host replays it encrypted. Logs never reach the server in readable form.
- The host now starts in AI mode (`devices.current_mode` defaults to `'ai'`), so a newly paired host can answer chat immediately.
- Added WebSocket events for the encrypted relay (`e2e:*`, `chat:*`) and for agent tasks (`agent:*`).
- Added security checklist items for the relay: payloads are never logged or stored, and server logs show only ciphertext.
- Restored proposal section 4.7 (Agent Tasks) and the references, which were lost in the submitted proposal. Tables were rebuilt cleanly.
- Deliverable 2 now marks each requirement as core or bonus. It adds a sequence diagram for AI chat and one for agent tasks, updates the architecture diagram, and includes the Appendix A (entity attributes) that the original referred to but did not include.
- Usability target changed from "start a game in under 10 minutes" to "pair a host and get a first AI reply in under 10 minutes", because AI is the core.
