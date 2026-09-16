# Local dev handoff — agent loop

Status snapshot for continuing this locally, e.g. after moving to a new
machine/environment. Nothing here is secret; it's just the state of a local
dev setup.

## What's built

- `POST /api/agent/generate` and `POST /api/agent/rewrite`
  (`apps/server/src/agent/routes.ts`, `generatePrototype.ts`,
  `rewritePrototype.ts`) — an OpenAI-backed loop that produces or edits a
  prototype's file tree (`apps/server/src/agent/openaiClient.ts`,
  `generateTree.ts`, `systemPrompt.ts`).
- The "Generate" and "Rewrite" boxes in the web app at
  `http://127.0.0.1:5199` call these endpoints.

## Prerequisites for running it locally

1. **PostgreSQL 16** via Homebrew, started manually (not `brew services`):
   ```bash
   /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 start
   ```
   This needs to be re-run after every reboot. A `drydock` role and database
   should already exist locally; migrations are applied via
   `pnpm --filter @drydock/server run migrate` if they aren't.

2. **Design system vendored**: `vendor/` (gitignored) synced via
   `pnpm run sync:design-system`, then `pnpm install` at the repo root.

3. **`apps/server/.env`**:
   ```
   DATABASE_URL=postgres://drydock:<password>@localhost:5432/drydock
   PORT=5299
   DRYDOCK_WEB_ORIGIN=http://127.0.0.1:5199,http://127.0.0.1:5181
   OPENAI_API_KEY=<a real key — the placeholder value does not work>
   OPENAI_MODEL=            # optional; defaults to gpt-4.1 if unset
   ```
   `apps/server/src/agent/openaiClient.ts` throws `OPENAI_API_KEY is not set`
   if this is missing, and the OpenAI call itself will fail with an auth
   error if it's a placeholder rather than a real key.

## Running it

```bash
# terminal 1
pnpm --filter @drydock/server run dev   # http://127.0.0.1:5299

# terminal 2
pnpm --filter @drydock/web run dev      # http://127.0.0.1:5199
```

Then in the browser at `http://127.0.0.1:5199`:

1. Use the **Generate** box to describe a screen and confirm a prototype
   compiles and renders on the canvas.
2. Use the **Rewrite** box with a follow-up instruction against that same
   prototype and confirm the edit applies without losing anchored comments.

## As of this handoff

Everything above was in place except a real `OPENAI_API_KEY` — the `.env`
still had a placeholder value, so the loop hadn't been exercised end-to-end
in the browser yet. That's the one blocking step before Generate/Rewrite can
be tested.
