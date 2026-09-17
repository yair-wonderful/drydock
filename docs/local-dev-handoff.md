# Local dev handoff — agent loop

Status snapshot for continuing this locally, e.g. after moving to a new
machine/environment. Nothing here is secret; it's just the state of a local
dev setup.

## What's built

- `POST /api/agent/generate` and `POST /api/agent/rewrite`
  (`apps/server/src/agent/routes.ts`, `generatePrototype.ts`,
  `rewritePrototype.ts`) — an OpenAI-compatible loop that produces or edits a
  prototype's file tree (`apps/server/src/agent/openaiClient.ts`,
  `generateTree.ts`, `systemPrompt.ts`). In local Wonderful-backed development,
  `scripts/wonderful-llm-adapter.mjs` provides that OpenAI-compatible endpoint
  by forwarding structured completions to the Wonderful function
  `/api/v1/functions/drydock-llm-completion`.
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

3. **`apps/server/.env`**, using the Wonderful-backed adapter (no external key):
   ```
   DATABASE_URL=postgres://drydock:<password>@localhost:5432/drydock
   PORT=5299
   DRYDOCK_WEB_ORIGIN=http://127.0.0.1:5199,http://127.0.0.1:5181
   OPENAI_API_KEY=drydock-local-function-adapter
   OPENAI_BASE_URL=http://127.0.0.1:5399/v1
   ```

   `OPENAI_API_KEY` is still required because the server uses the OpenAI SDK,
   but when `OPENAI_BASE_URL` points at the local adapter this value is only a
   local placeholder.

   If you deliberately want to test against OpenAI directly instead, use:
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
pnpm run setup:local                    # first run, or after dependency changes
pnpm run dev                            # starts adapter + API + web in one terminal
```

That opens the same three local services the manual flow used to start in
separate terminals:

- Wonderful-backed local model adapter: `http://127.0.0.1:5399/v1`
- Drydock API: `http://127.0.0.1:5299`
- Drydock web app: `http://127.0.0.1:5199`

When the adapter is enabled, `pnpm run dev` also supplies the API's local model
defaults automatically. For direct testing against another model endpoint, put
those values in `apps/server/.env` and run `pnpm run dev -- --no-adapter`.

For a one-command smoke test that starts those services, runs the agent-loop
verification, and shuts them down afterwards, use:

```bash
pnpm run verify:agent-loop:local
```

In the Wonderful sandbox, do not run the full local install just to validate a
code change. Use the lightweight validation lane instead:

```bash
pnpm run setup:sandbox
pnpm run typecheck:sandbox
```

That installs only the app packages TypeScript needs here and avoids the full
vendored design-system dependency graph, which is too large for the sandbox
memory cap.

Then in the browser at `http://127.0.0.1:5199`:

1. Use the **Generate** box to describe a screen and confirm a prototype
   compiles and renders on the canvas.
2. Use the **Rewrite** box with a follow-up instruction against that same
   prototype and confirm the edit applies without losing anchored comments.

## As of this handoff

The Wonderful-backed adapter is the preferred local path when the developer does
not have an external model key. It expects the Wonderful CLI (`wful`) to be
installed and authenticated locally; if the adapter returns an auth/connectivity
error, run `wful doctor` before retrying the smoke test.
