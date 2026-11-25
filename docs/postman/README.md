# Postman collection

`Ownstream_API.postman_collection.json` holds every backend request built so far (46 requests), grouped by module:
Login, F1 Profile, F2 Host (no login), F2 Devices, F3 Games, F4 Stream profiles, F6 Conversations, F7 Personas,
F8 Agent tasks, F9 Alert rules and F10 Access rules.

## How to use it

1. In Postman, click **Import** and choose `Ownstream_API.postman_collection.json`.
2. Create an environment named **Ownstream Local** with these variables:

   | Variable | Value |
   |---|---|
   | `baseUrl` | `http://localhost:3000/api` |
   | `supabaseUrl` | the Supabase Project URL |
   | `anonKey` | the Supabase anon (publishable) key |
   | `token` | leave empty; the Login request fills it |

3. Start the server (`npm run dev:server` from the repository root).
4. Run **Login** with a test user's email and password. Every other request then sends `Authorization: Bearer {{token}}`.
5. For requests with `:id`, copy an ID from the matching POST or GET request.

The environment is not committed because it holds keys. Never put keys or passwords in the collection itself.

## Pairing a test host

1. Run **POST /host/pairing-code** and note `code` and `pairingSecret`.
2. Run **POST /devices/pair** with that code (logged in as the user). The reply says `claimed`.
3. Run **GET /host/pairing-status/:code** with the code and the `X-Pairing-Secret` header. The reply holds `deviceId` and
   the device token, shown only once. Before step 2 the same request only says `pending`.
4. The device now shows in **GET /devices**.

**POST /conversations** and **POST /agent-tasks** need `hostDeviceId`: replace `<id from GET /devices>` with the
`deviceId` from step 3. **POST /games** can take it too, to say which PC the game is installed on.

## What to expect

| Request | Normal reply | Notes |
|---|---|---|
| POST /host/pairing-code | 201 | More than 5 a minute gives 429 (rate limit). |
| GET /games/search | 200 | Up to 10 RAWG results. More than 30 a minute gives 429. If RAWG is down it gives 503; add the game by title instead. |
| POST /games (Steam / RAWG) | 201 | Title, cover and genres are copied from RAWG (`rawgId` 29338 is Days Gone). |
| POST /games (Exe) | 201 | A launch target that does not fit the launch type gives 400. |
| POST /agent-tasks | 201 | The task stays `queued` until the host app is online in AI mode. |
| PATCH /agent-tasks/:id (approve or reject) | 409 while queued | Approve and reject work only while the task is `waiting_approval`, which needs the host app running. Cancel works on any open task. |
| DELETE /agent-tasks/:id | 204 | A running task must be cancelled first (409). |
| POST /alert-rules or /access-rules twice for the same event or type | 409 | One alert per event and one rule per type. |
| POST /access-rules with bad settings | 400 | For example idle timeout `minutes` above 240. |
| Any `:id` that belongs to another user | 404 | The server never shows another user's data. |

## Clean up after testing

Delete what you created (games, rules, tasks, the test device) so the next test starts clean.
Deleting the test device also deletes its conversations and agent tasks.
