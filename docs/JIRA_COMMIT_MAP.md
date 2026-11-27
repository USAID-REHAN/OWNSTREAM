# Jira cards and their commits

Sprint 1 (Deliverable 3, backend) has 43 tasks on the Jira board (space OWNSTREAM, key SCRUM). Every commit message
starts with the key of the card it belongs to, so each card below links to its commits on GitHub. The team pushed
straight to `main` from each member's own account (no pull requests), and CI checked every push.

Cards without a commit are hands-on tasks done in a dashboard or on a PC; the last column says where to see them.

| Card | Task | Assigned | Commits or evidence |
|---|---|---|---|
| [SCRUM-23](https://ownstream.atlassian.net/browse/SCRUM-23) | Update proposal, implementation plan and design document to version 3 | Usaid | Documents in `docs/` (added with the SCRUM-24 commit) |
| [SCRUM-24](https://ownstream.atlassian.net/browse/SCRUM-24) | Monorepo skeleton, shared package and CI workflow | Usaid | [`b4ca55f`](https://github.com/USAID-REHAN/OWNSTREAM/commit/b4ca55fbf0bb7617095fbd49ac6e17bc87cb0eb2) Mon 23 Nov |
| [SCRUM-25](https://ownstream.atlassian.net/browse/SCRUM-25) | Add the instructor to the GitHub repository and the Jira space | Usaid | GitHub collaborator Obaidullah704 (accepted) and access to the Jira space |
| [SCRUM-26](https://ownstream.atlassian.net/browse/SCRUM-26) | Create the Neon project (main and dev branches) and run db/neon_schema.sql | Bilal | Done in the Neon dashboard (project ownstream, branches main and dev) |
| [SCRUM-27](https://ownstream.atlassian.net/browse/SCRUM-27) | Create the Supabase project, run db/supabase_schema.sql and collect the keys | Bilal | Done in the Supabase dashboard; keys are kept out of Git |
| [SCRUM-28](https://ownstream.atlassian.net/browse/SCRUM-28) | Get the RAWG API key, create the Telegram bot with BotFather, create the Render account | Bilal | Done in the RAWG, Telegram (BotFather) and Render dashboards; keys are kept out of Git |
| [SCRUM-29](https://ownstream.atlassian.net/browse/SCRUM-29) | Server foundation: config validation, database connection, health check, security middleware | Usaid | [`880fc45`](https://github.com/USAID-REHAN/OWNSTREAM/commit/880fc45e02f3e3b959de3411016c4cda2492a717) Mon 23 Nov |
| [SCRUM-30](https://ownstream.atlassian.net/browse/SCRUM-30) | Supabase token guard with a 60 second cache | Usaid | [`880fc45`](https://github.com/USAID-REHAN/OWNSTREAM/commit/880fc45e02f3e3b959de3411016c4cda2492a717) Mon 23 Nov |
| [SCRUM-31](https://ownstream.atlassian.net/browse/SCRUM-31) | Profile endpoints: GET, PATCH and DELETE /api/me | Usaid | [`880fc45`](https://github.com/USAID-REHAN/OWNSTREAM/commit/880fc45e02f3e3b959de3411016c4cda2492a717) Mon 23 Nov |
| [SCRUM-32](https://ownstream.atlassian.net/browse/SCRUM-32) | Pairing code endpoints: create, status polling, claim once, expiry, rate limits | Usaid | [`14ac9b0`](https://github.com/USAID-REHAN/OWNSTREAM/commit/14ac9b05a48bd3dbcf664eff24899232d0d6b5c2) Tue 24 Nov |
| [SCRUM-33](https://ownstream.atlassian.net/browse/SCRUM-33) | Device token hashing with a pepper and the device guard | Usaid | [`6424550`](https://github.com/USAID-REHAN/OWNSTREAM/commit/642455068d6726f6f3e25f685bc6abfa83f9795b) Tue 24 Nov |
| [SCRUM-34](https://ownstream.atlassian.net/browse/SCRUM-34) | Device list, rename and unpair (revoke token, drop live sockets) | Usaid | [`bd1e889`](https://github.com/USAID-REHAN/OWNSTREAM/commit/bd1e889ab25cfbd9700261922c12876f3371119b) Tue 24 Nov |
| [SCRUM-35](https://ownstream.atlassian.net/browse/SCRUM-35) | Stream profiles CRUD module with three default presets | Bilal | [`d0ea63c`](https://github.com/USAID-REHAN/OWNSTREAM/commit/d0ea63c2f89644cc908540ce4563da6f86a6a3bf) Mon 23 Nov |
| [SCRUM-36](https://ownstream.atlassian.net/browse/SCRUM-36) | Postman collection and environment: F1, F2 and F4 requests | Bilal | [`e530df0`](https://github.com/USAID-REHAN/OWNSTREAM/commit/e530df0e2906988dd5d3d205d814702e35f657be) Tue 24 Nov |
| [SCRUM-37](https://ownstream.atlassian.net/browse/SCRUM-37) | Realtime gateway: host and viewer authentication, heartbeats, presence | Usaid | [`ff39139`](https://github.com/USAID-REHAN/OWNSTREAM/commit/ff39139a94832c93fabd0b655159f2a21b037cc4) Tue 24 Nov |
| [SCRUM-38](https://ownstream.atlassian.net/browse/SCRUM-38) | Offline scheduler: mark hosts offline after 45 seconds without a heartbeat | Usaid | [`ff39139`](https://github.com/USAID-REHAN/OWNSTREAM/commit/ff39139a94832c93fabd0b655159f2a21b037cc4) Tue 24 Nov |
| [SCRUM-39](https://ownstream.atlassian.net/browse/SCRUM-39) | Shared e2e.ts encryption module with unit tests | Usaid | [`ad691bd`](https://github.com/USAID-REHAN/OWNSTREAM/commit/ad691bdb59d8465277e95d51d7aa08d08265978f) Mon 23 Nov |
| [SCRUM-40](https://ownstream.atlassian.net/browse/SCRUM-40) | Encrypted relay service for e2e, chat and agent step events with ownership checks | Usaid | [`1bf0241`](https://github.com/USAID-REHAN/OWNSTREAM/commit/1bf02419f9bded71f926036fd4d604ac26a39665) Tue 24 Nov |
| [SCRUM-41](https://ownstream.atlassian.net/browse/SCRUM-41) | Conversations CRUD (metadata only) and chat:purge to the host | Usaid | [`4399c5c`](https://github.com/USAID-REHAN/OWNSTREAM/commit/4399c5c92f2d4964e907cb2d4a9631c509d1964a) Tue 24 Nov |
| [SCRUM-42](https://ownstream.atlassian.net/browse/SCRUM-42) | Personas CRUD module | Bilal | [`e13427a`](https://github.com/USAID-REHAN/OWNSTREAM/commit/e13427acef5907bee0e15896f3a87a06c446cfcf) Tue 24 Nov |
| [SCRUM-43](https://ownstream.atlassian.net/browse/SCRUM-43) | Create three starter personas on first login | Bilal | [`e13427a`](https://github.com/USAID-REHAN/OWNSTREAM/commit/e13427acef5907bee0e15896f3a87a06c446cfcf) Tue 24 Nov |
| [SCRUM-44](https://ownstream.atlassian.net/browse/SCRUM-44) | Postman: F6 and F7 requests | Bilal | [`e530df0`](https://github.com/USAID-REHAN/OWNSTREAM/commit/e530df0e2906988dd5d3d205d814702e35f657be) Tue 24 Nov |
| [SCRUM-45](https://ownstream.atlassian.net/browse/SCRUM-45) | Agent tasks CRUD and status flow | Usaid | [`775f98a`](https://github.com/USAID-REHAN/OWNSTREAM/commit/775f98aec81376ef06dc5f3962ec0977b0b01cc8) Wed 25 Nov |
| [SCRUM-46](https://ownstream.atlassian.net/browse/SCRUM-46) | Approval flow: agent:approval, waiting_approval, PATCH approve, agent:decision, agent:log_fetch | Usaid | [`775f98a`](https://github.com/USAID-REHAN/OWNSTREAM/commit/775f98aec81376ef06dc5f3962ec0977b0b01cc8) Wed 25 Nov |
| [SCRUM-47](https://ownstream.atlassian.net/browse/SCRUM-47) | Access rules CRUD module | Bilal | [`9ecaed6`](https://github.com/USAID-REHAN/OWNSTREAM/commit/9ecaed682686e0eae0fbde67171206b030058d3c) Wed 25 Nov |
| [SCRUM-48](https://ownstream.atlassian.net/browse/SCRUM-48) | Rules engine checked before every session request | Usaid | [`80484ff`](https://github.com/USAID-REHAN/OWNSTREAM/commit/80484ffb952f690b8d5521ddefc5c66ddbc25b26) Wed 25 Nov |
| [SCRUM-49](https://ownstream.atlassian.net/browse/SCRUM-49) | RAWG client: search proxy, detail fetch and caching | Usaid | [`29c4ab8`](https://github.com/USAID-REHAN/OWNSTREAM/commit/29c4ab861fad9c4cc17862affdd7115839bf3141) Wed 25 Nov |
| [SCRUM-50](https://ownstream.atlassian.net/browse/SCRUM-50) | Games CRUD with launch target validation | Usaid | [`29c4ab8`](https://github.com/USAID-REHAN/OWNSTREAM/commit/29c4ab861fad9c4cc17862affdd7115839bf3141) Wed 25 Nov |
| [SCRUM-51](https://ownstream.atlassian.net/browse/SCRUM-51) | Session control plane: request, rules check, host approval, game launch, end, history | Usaid | [`a54df19`](https://github.com/USAID-REHAN/OWNSTREAM/commit/a54df19aba66ed30cb052e164ee86856bc1a78cb) Thu 26 Nov |
| [SCRUM-52](https://ownstream.atlassian.net/browse/SCRUM-52) | Alert rules CRUD module | Bilal | [`5ed860c`](https://github.com/USAID-REHAN/OWNSTREAM/commit/5ed860cd5b91d59b9b23e8e48de7303213d83552) Wed 25 Nov |
| [SCRUM-53](https://ownstream.atlassian.net/browse/SCRUM-53) | Postman: F3, F5, F8, F9 and F10 requests | Bilal | [`79ac61f`](https://github.com/USAID-REHAN/OWNSTREAM/commit/79ac61fafd115eaf784d4962d2de0f2d34180f21) Wed 25 Nov |
| [SCRUM-54](https://ownstream.atlassian.net/browse/SCRUM-54) | Telegram link codes, webhook with secret check and alert dispatcher | Usaid | [`19ae012`](https://github.com/USAID-REHAN/OWNSTREAM/commit/19ae0126dac7d71c0f897e9e3f22fc4b99666017) Thu 26 Nov |
| [SCRUM-55](https://ownstream.atlassian.net/browse/SCRUM-55) | Audit interceptor for pairing, sessions, rule changes and account deletion | Usaid | [`d7864fe`](https://github.com/USAID-REHAN/OWNSTREAM/commit/d7864fe8d62cee712d0b2e3e56957ad3bc2686a2) Thu 26 Nov |
| [SCRUM-56](https://ownstream.atlassian.net/browse/SCRUM-56) | Per route rate limits and abuse tests | Usaid | [`41de782`](https://github.com/USAID-REHAN/OWNSTREAM/commit/41de78209410d92a0ca9d68601e7674a560f95e1) Thu 26 Nov |
| [SCRUM-57](https://ownstream.atlassian.net/browse/SCRUM-57) | Unit and integration tests (Jest and Supertest) running in CI | Usaid | [`21edca7`](https://github.com/USAID-REHAN/OWNSTREAM/commit/21edca7e9b16b07bbc754c0566881c0b2e108a72) Thu 26 Nov |
| [SCRUM-58](https://ownstream.atlassian.net/browse/SCRUM-58) | Server Dockerfile, docker-compose.yml and render.yaml | Usaid | [`d44bd2c`](https://github.com/USAID-REHAN/OWNSTREAM/commit/d44bd2c3a6ded01ef661bedbfcb240ebac4ee111) Thu 26 Nov |
| [SCRUM-59](https://ownstream.atlassian.net/browse/SCRUM-59) | Two account security tests (T03, T04, T16, T17) and bug reports in Jira | Bilal | Postman tests against Docker on Bilal's PC; screenshots in the submission zip |
| [SCRUM-60](https://ownstream.atlassian.net/browse/SCRUM-60) | Database evidence: screenshots of Neon tables and Supabase users | Bilal | Neon and Supabase screenshots in the submission zip |
| [SCRUM-61](https://ownstream.atlassian.net/browse/SCRUM-61) | README: how to run the backend, environment variables and endpoint list | Bilal | [`a73f9d5`](https://github.com/USAID-REHAN/OWNSTREAM/commit/a73f9d5942d02a398deaafd7292e0d6585cbcb2c) Thu 26 Nov |
| [SCRUM-62](https://ownstream.atlassian.net/browse/SCRUM-62) | Run docker compose on a second machine and report any build problems | Bilal | docker compose on Bilal's PC; screenshot in the submission zip |
| [SCRUM-63](https://ownstream.atlassian.net/browse/SCRUM-63) | Package the backend zip and submit Deliverable 3 | Usaid | Committed on Fri 27 Nov (`docs/DELIVERABLE_3.md`); the zip is built from the repository |
| [SCRUM-64](https://ownstream.atlassian.net/browse/SCRUM-64) | Jira upkeep for Deliverable 3: card status, links to pull requests | Bilal | This file, committed on Fri 27 Nov |
| [SCRUM-65](https://ownstream.atlassian.net/browse/SCRUM-65) | Work log for Deliverable 3 | Bilal | `team/usaid/WORKLOG.md` and `team/bilal/WORKLOG.md`, updated every day |

## Commits without a card

| Commit | By | Day | What |
|---|---|---|---|
| [`73802d6`](https://github.com/USAID-REHAN/OWNSTREAM/commit/73802d69aa321dbcb7e3c7bfd529f2a35e96f0c0) | Usaid | Sun 04 Oct | Initial commit |
| [`db42644`](https://github.com/USAID-REHAN/OWNSTREAM/commit/db4264436284503ac4e5415d97a09dba1d90029a) | Usaid | Mon 23 Nov | Add team work logs |
| [`75cce38`](https://github.com/USAID-REHAN/OWNSTREAM/commit/75cce3806e7a762887a4d3e39b468739fe8eeac5) | Bilal | Mon 23 Nov | Add work log entry for 23 Nov |
| [`e211519`](https://github.com/USAID-REHAN/OWNSTREAM/commit/e211519ab5260fbaed9eb542e8dac75d2a0b74f8) | Usaid | Tue 24 Nov | Grant profiles table access for new Supabase projects |
| [`d6c1939`](https://github.com/USAID-REHAN/OWNSTREAM/commit/d6c1939cc891c57fbf2cf6773c78bf69f4da3b7a) | Bilal | Tue 24 Nov | Add work log entry for 24 Nov |

## Commits per member

| Member | Commits up to Thu 26 Nov |
|---|---|
| Usaid | 21 |
| Bilal | 9 |
