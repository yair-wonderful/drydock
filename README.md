# Drydock

AI prototyping for Wonderful employees. A designer, PM or engineer describes a
screen; Drydock compiles it **in the browser** against the real Wonderful design
system, renders it on an infinite canvas, and keeps review comments anchored to
elements across rewrites.

No MicroVM. No sandbox provisioning. No server build. A prototype is source, and
the browser is the build system.

## This repository is standalone

Drydock does **not** live in the Wonderful monorepo and does not need a checkout
of it to run. There is exactly one link between the two, it is one-directional,
and it is a script:

```
scripts/fetchDesignSystem.ts   reads  wonderfulcx/wonderful : libs/ui, libs/theme
                               writes vendor/ui, vendor/theme
```

Nothing is ever written back. Nothing else in this repo reaches into the
monorepo.

### Why fetch the design system instead of installing it

The published `@wonderful/ui-base` package is a build artifact of the *next*
major. Prototypes are supposed to look like the platform as it is **today**, so
Drydock consumes `libs/ui` from source — which also means a designer can pull a
component change the hour it merges, rather than the release after.

What lands is two real pnpm workspace packages rather than a folder of copied
files, so `@wonderful/theme: "workspace:*"` inside the UI package keeps
resolving exactly as it does in the monorepo, and `@wonderful/ui/components`
resolves through the package's own `exports` map with no aliases.

`vendor/` is gitignored; `vendor/SOURCE.json` is committed. A checkout is
reproducible from the pinned commit, a design-system bump is a one-line diff
rather than a few thousand, and this repo's history does not accumulate another
repository's source.

### Staying in sync

The pin is deliberately static — nothing re-fetches on its own — so it can go
stale silently while `libs/ui`/`libs/theme` keep moving in the monorepo.
`pnpm run check:design-system` asks the GitHub API whether either path has
changed since the pinned commit and lists what landed if so; it also runs
(non-blocking) before `pnpm run dev`, so starting work is when you find out,
not the next time something looks subtly off. It needs a `GITHUB_TOKEN`/
`GH_TOKEN` env var or an authenticated `gh` CLI to read the (private) monorepo;
without one it says so rather than reporting a false "up to date". Finding it
stale means: `pnpm run sync:design-system`, then `pnpm install`, then
`pnpm run verify` to confirm nothing broke.

## Getting started

```bash
pnpm run sync:design-system          # fetch libs/ui + libs/theme (network)
# or, with a monorepo checkout already on disk, skip the network:
node scripts/fetchDesignSystem.ts --from ../wonderful

pnpm install
pnpm run dev                         # http://127.0.0.1:5199
```

## Verifying

Both suites drive a real browser (Playwright) against a real dev server. Start
`pnpm run dev` first, then:

```bash
pnpm --filter @drydock/web verify            # 9 checks: compile, mount, tokens, utility rejection
pnpm --filter @drydock/web verify:anchoring  # 6 checks: comment anchoring across an AI rewrite
```

The anchoring suite includes a deliberate control — it shows what a *positional*
comment pin would have pointed at after the same rewrite ("Median latency"
silently becomes "Escalations"), because the failure this feature prevents is
invisible unless you show it.

## What is here

| Path | |
|---|---|
| `apps/web/src/drydock/` | The compiler: `esbuild-wasm` over a virtual file tree, the app template's source-anchor Babel plugin ported to the browser, and compile-time rejection of utility classes the design system cannot emit |
| `apps/web/src/anchoring/` | Comment anchoring by element identity, resolving to `attached` / `needsReview` / `orphaned` |
| `apps/web/src/blackbird/` | Packaging a compiled prototype as an infinite-canvas frame |
| `apps/web/blackbird-join/` | An idempotent patcher that joins the engine to a Blackbird checkout without modifying its canvas, contract, comments or service worker |
| `scripts/fetchDesignSystem.ts` | The only link to the monorepo |
| `scripts/checkDesignSystemStaleness.ts` | Reports whether the vendored pin is behind `libs/ui`/`libs/theme` |

## The one real limitation

Tailwind v4 is a **build-time scanner**: a utility class a prototype invents at
runtime has no rule behind it and renders with no effect. Design-system
components are unaffected. Rather than let that fail silently, the compiler
rejects unknown utilities at the author's own line and names the design-system
alternative — `gap` on a `Layout.*`, a `Card`'s own inset, a design token.

## Status

The compiler, anchoring and canvas join are working and verified. Persistence
exists (`apps/server`, verified end-to-end through a real browser against
Postgres — 8 checks) and is wired into the Blackbird join (`apps/web/blackbird-join`
— compile, comments, multiplayer sync, and loading a real persisted prototype
by id are each independently verified, 4-6 checks apiece). Not yet built: the
agent loop that writes the file tree.
