# Work Log: M. Bilal (241914)

One entry per working day: what was done, which Jira cards, and which commits or files.
Add each entry yourself and push it from your own GitHub account.

## Mon 23 Nov 2026

- Stream profiles CRUD module (`/api/stream-profiles`) with the three default presets (1080p 60, 720p 60, 720p 30), database limit checks and unit tests (SCRUM-35).
- Jira cards: SCRUM-35

## Tue 24 Nov 2026

- Created the Neon project (ownstream, Singapore) with main and dev branches and ran `db/neon_schema.sql` on both (SCRUM-26).
- Created the Supabase project, ran `db/supabase_schema.sql`, added two test users and ran the profiles grant fix (SCRUM-27).
- Got the RAWG API key, created the Telegram bot with BotFather and made the Render account (SCRUM-28). Sent the keys to Usaid through a secure link.
- Personas CRUD module (`/api/personas`) with unit tests (SCRUM-42).
- The three starter personas (Study helper, Code reviewer, Plain language explainer), created once per user on first use (SCRUM-43).
- Postman collection with 21 requests for login, F1, F2, F4, F6 and F7, in `docs/postman` (SCRUM-36, SCRUM-44).
- Jira cards: SCRUM-26, 27, 28, 36, 42, 43, 44

## Wed 25 Nov 2026

- Access rules CRUD (`/api/access-rules`): allowed hours, approval, idle timeout and known networks, one rule of each type, settings checked with the same function the rules engine uses (SCRUM-47).
- Alert rules CRUD (`/api/alert-rules`): turn Telegram alerts on or off per event, one per event (SCRUM-52).
- Unit tests for both, and a live check against Neon showing the rules engine refusing a session outside the allowed hours.
- Postman collection now covers F3 Games, F8 Agent tasks, F9 Alert rules and F10 Access rules too (46 requests). Ran all of them against the local server, and added a table of expected replies to `docs/postman/README.md` (SCRUM-53).
- Jira cards: SCRUM-47, 52, 53

## Thu 26 Nov 2026

- Rewrote the README: how to run the backend (Node and Docker), every environment variable, the full endpoint list, realtime events, rate limits, tests and Telegram setup (SCRUM-61).
- Jira cards: SCRUM-61

## Fri 27 Nov 2026

- Added the F5 Sessions and F9 Telegram requests to the Postman collection (54 requests now) and ran all of them against the server, with a test PC approving the session (SCRUM-53).
- Jira upkeep: `docs/JIRA_COMMIT_MAP.md` links every Sprint 1 card to its commits, or says where the evidence is for hands-on tasks (SCRUM-64).
- Work log for Deliverable 3 (SCRUM-65).
- Jira cards: SCRUM-53, 64, 65

## Deliverable 3 summary

| Card | What |
|---|---|
| SCRUM-26, 27, 28 | Neon and Supabase projects with the schemas, test users, RAWG key, Telegram bot, Render account |
| SCRUM-35 | Stream profiles module with three default presets |
| SCRUM-42, 43 | Personas module and the three starter personas |
| SCRUM-36, 44, 53 | Postman collection: 54 requests for every module, with a README of expected replies |
| SCRUM-47 | Access rules module, checked with the same rules the session check uses |
| SCRUM-52 | Alert rules module |
| SCRUM-61 | README: how to run, settings, endpoints and tests |
| SCRUM-59, 60, 62 | Security tests with two accounts, database screenshots, Docker on a second PC |
| SCRUM-64, 65 | Jira upkeep and this work log |

## Entry template

```
## <Day> <date> Nov 2026

- What I did:
- Jira cards:
- Commits or files:
```
