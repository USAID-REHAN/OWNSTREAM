# Database schemas

Ownstream uses two PostgreSQL databases that never join:

| File | Database | Holds |
|---|---|---|
| `supabase_schema.sql` | Supabase | `profiles` (one row per signed-up user) and the trigger that creates it |
| `neon_schema.sql` | Neon | Everything else: devices, pairing codes, games, stream profiles and sessions, conversations, personas, agent tasks, alert and access rules, Telegram link codes, audit log |

Every Neon table stores the Supabase user id in a plain `user_id uuid` column, and the server filters every query by it.

## Running them

**Supabase:** open the project, go to **SQL Editor**, paste `supabase_schema.sql` and run it.

**Neon:** open the project, go to **SQL Editor**, choose the `main` branch, paste `neon_schema.sql` and run it. Then switch to the `dev` branch and run it again.

You can also run it with `psql`:

```bash
psql "$NEON_DATABASE_URL" -f db/neon_schema.sql
```

**Local Docker database:** `docker compose up` runs `neon_schema.sql` automatically the first time the `postgres` container is created. To start again from an empty database, run `docker compose down -v` and then `docker compose up`.

## Changing a schema

Edit the `.sql` file in a pull request, and update the matching TypeORM entity in `apps/server/src/database/entities` and the enum lists in `packages/shared/src/enums.ts`. A shared test checks that the enum lists match this file.
