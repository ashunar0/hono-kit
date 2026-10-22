# Changelog

What changed in each version of hono-kit, and how to rewrite an app for what breaks. Versions before 0.6.0 are not listed.

## Unreleased

### Breaking

- `createEndpoint` takes the guard in a required `auth` key: `middleware: [requireAuth]` becomes `auth: requireAuth`. Leaving it out is a type error, so a public endpoint writes `auth: allowAnonymous`. `middleware` stays for other middleware and runs after `auth`. Rewrite with `perl -pi -e 's/middleware: \[(\w+(?:\([^)]*\))?)\]( as const)?/auth: $1/' src/routes/**/index.ts`
- The lint `route-declares-auth` is gone (the type does its work). Remove `"hnk/route-declares-auth"` from `.oxlintrc.json`. Guards no longer need names starting with `require` / `allow`

### Removed

- The lint `route-lists-are-paged`. Whether a list is paged is up to the app; a paged list still uses `pageQuerySchema` / `pageResponseSchema` / `pageResponse`. Remove `"hnk/route-lists-are-paged"` from `.oxlintrc.json` and the `oxlint-disable-next-line hnk/route-lists-are-paged` lines, or oxlint stops on the unknown rule

### Added

- Catch-all routes: `src/routes/files/[...path]/index.ts` is `/files/:path{.+}`, one segment or more with slashes. Declare `path` in `request.param`. It must be the last segment, and is registered after the static and `[id]` routes beside it

## 0.7.0

### Breaking

- `src/routes/**/index.ts` may export only `GET` / `POST` / `PUT` / `PATCH` / `DELETE`, each `createEndpoint(...)` (lint `route-exports-endpoints`). Move a helper exported from there to a file that starts with `_` (`_response.ts`), or stop exporting it. A plain array is no longer an `Endpoint` and fails to type-check in `routes.gen.ts`
- `route-writes-once` finds more writes: a write inside a loop or a `map` / `forEach` callback, deps taken apart in the body (`const { books } = deps`), and `get…` / `list…` joined with `Or` / `And` (`getOrCreate`). Write all of it in one service call; rename a read that writes to `ensure…`
- `hnk gen` stops on a path segment it cannot read (`[...name]`, `[id`), instead of registering it as written

### Added

- Route groups: a directory in parentheses (`src/routes/(signed-in)/invoices/`) groups files and is left out of the URL. Two directories at the same URL stop `hnk gen`
- `hnk gen --check` compares without writing. The template's `pnpm check` uses it when `CI` is set, so a stale `routes.gen.ts` that was committed fails
- `hnk g domain --singular <name>`, asked for when the singular cannot be guessed (`data`, `status`)
- `hnk g domain` writes the `…Within(db)` window in `repo.d1.ts`
- `lint`: `createEndpoint` imported under another name (`import { createEndpoint as ep }`) is checked like `createEndpoint`

### Fixed (template)

Copy these into an app made with 0.6.0:

- `package.json`: `"postinstall": "hnk gen"`, so types pass right after install (no `routes.gen.ts` before)
- `package.json`: `"dev": "node scripts/dev.mjs"`, and `scripts/dev.mjs`, which runs `wrangler dev` with `hnk gen --watch`
- `scripts/check.mjs`: the `routes.gen.ts` step is `["pnpm", "hnk", "gen", ...(process.env.CI ? ["--check"] : [])]`
- `.oxlintrc.json`: `"hnk/route-exports-endpoints": "error"`

## 0.6.0

### Breaking

- Routes are directories. A directory under `src/routes/` is the path (`[id]` is `:id`), and each method is an export: `export const GET = createEndpoint({ request, responses, middleware }, handler)`. `createRouter().endpoint(...)` and `.route(...)` mounts are gone
- `pnpm hnk gen` writes `src/routes.gen.ts`: `registerRoutes(app)`, `makeQueries(db)` and `AppType`. In `src/index.ts` call `registerRoutes(app)` after the middleware and export `AppType` for `hc`; in `src/deps.ts` return `...makeQueries(db)`. Commit `routes.gen.ts`
- `createRouter` is `createApp`. It only makes the root of the app
- Files next to `index.ts` start with `_`: `response.ts` → `_response.ts`, `queries.d1.ts` → `_queries.ts`, `errors.ts` → `_errors.ts`. A queries file exports `…Queries(db)` (`invoicesQueries`), which deps receive under that name
- Imports from outside your own domain or resource go through `#src/*` (`"imports": { "#src/*": "./src/*.ts" }` in `package.json`); `import { … } from "#src/db/index"` for a directory
- New lint `route-writes-once`: an HTTP handler of a user's request writes through one call to one service (reads are named `get…` / `list…`). Add `"hnk/route-writes-once": "error"` to `.oxlintrc.json`

### Changed

- Rule: a state transition is a verb directory with `POST` only (`src/routes/invoices/[id]/send/index.ts`), not `PATCH { status }`
- The rules ship with the package (`node_modules/hono-kit/docs/`). The template's `AGENTS.md` only lists the commands and says to read `docs/index.md`
- Every lint message ends with the docs page to read (`More: node_modules/hono-kit/docs/<page>`)
- `oxc-parser` is a dependency, used by `hnk gen` only. What goes into the app is still `hono` only
