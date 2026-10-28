# Changelog

What changed in each version of hono-kit, and how to rewrite an app for what breaks. Versions before 0.6.0 are not listed.

## Unreleased

### Changed

- `createWorker` passes on what Workers gives, next to `deps` and `now`: `scheduled` gets `{ deps, now, controller, env, ctx }` and `queue` gets `{ deps, now, body, message, batch, env, ctx }` (types `WorkerCronContext`, `WorkerQueueContext` from `hono-kit/worker`). Several crons can be told apart by `controller.cron` and several queues by `batch.queue`, and a job can use `ctx.waitUntil` or `message.attempts`. A job that takes `CronContext` / `QueueContext` still fits, so nothing needs rewriting

- When `reply.failure` is passed details of the wrong shape, the error says what is wrong with them (`Type 'string' is not assignable to type 'number'`, under that field alone) instead of `not assignable to type 'never'` (under every field). Passing the code alone for a failure that declares details names the `{ code, details }` it takes. Only messages change: what is accepted is the same

## 0.14.0

### Changed

- A 400 (`VALIDATION_ERROR`) names every field that was wrong, with all its reasons, in `details`: `{ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: { amount: ["Too small: ..."], "items.0.name": ["..."] } } }`. Before, `message` was the first reason alone and no field was named. `message` is now `Invalid request`, unless the input as a whole is wrong (not JSON, not an object), when it says why and `details` is `{}`. In the client's type, `details` is `Record<string, string[]>`
- A path no endpoint has is answered like any other failure, `404 { error: { code: "NOT_FOUND", message: "Not found" } }`, instead of Hono's plain-text `404 Not Found` (`createApp` sets `notFound`)

## 0.13.0

### Breaking

- The app's entry is `src/main.ts`, and what every app wrote the same is in hono-kit. `src/index.ts`, `src/deps.ts`, `src/env.ts` and `src/middleware/auth.ts` go away. To rewrite an app:
  - Make `src/main.ts`: `export const makeDeps = (env: Env) => ({ db, sessionUser, ... })` (what `deps.ts` built), `export const buildApp = (deps = makeDeps, clock?: () => Date) => { const app = createApp({ makeDeps: deps, clock }); /* your middleware and routes */ registerRoutes(app); return app; }` and `export default createWorker({ makeDeps, fetch: buildApp().fetch })`. Point `main` in `wrangler.jsonc` at it
  - `createApp({ makeDeps, clock })` sets `now`, provides deps and answers failures with `onError`; drop those three from your app. `createApp()` with nothing passed still sets `now` and `onError`
  - Delete `src/env.ts` and the `declare module "hono-kit" { interface Register { ... } }` blocks: `hnk prepare` writes `Register` into `src/routes.gen.ts` from the `makeDeps` that `src/main.ts` exports (and stops when there is none). Bindings are what `makeDeps` takes
  - Import `requireAuth`, `allowAnonymous`, `CurrentUser`, `UserId` and `userId` from `hono-kit`, and delete `src/middleware/auth.ts`. `sessionUser` returns the user as the auth provider gives it (`{ id, name, email }`), not a `CurrentUser`: `requireAuth` brands it. A guard you write yourself gets the user with `getCurrentUser(c)` (new), the only way to make a `CurrentUser`. Tests sign in with plain users (`SessionUser`) and no `authenticatedUser`
  - The template serves no `/openapi.json`. Add `app.get("/openapi.json", (c) => c.json(openapiDocument(app, info)))` in `buildApp` if you serve one
  - `ApiApp` is not re-exported: import `AppType` from `src/routes.gen.ts` for `hc`

## 0.12.0

### Added

- A failure can carry the numbers behind it. Declare `details: z.object({ ... })` on it, and return it as `reply.failure({ code, details })` (or pass on the `err({ code, details })` a function returned). The response is `{ error: { code, message, details } }`; in the client's type, `details` has the declared shape once the `code` is checked, and the OpenAPI document shows each failure with details as its own branch. Failures without details are returned as before

## 0.11.1

### Fixed (template)

- A new app failed `pnpm check` at `format:check`: the template's `src/middleware/auth.ts` was not formatted. An app made with 0.11.0 runs `pnpm exec prettier --write src/middleware/auth.ts`

## 0.11.0

### Breaking

- deps are in Hono's context: a handler reads `c.var.deps` instead of taking a third argument, and a middleware after `provideDeps` reads it too, so an auth middleware that needs the database no longer builds its own. Rewrite `async (c, reply, { db }) => {` as `async (c, reply) => {` followed by `const { db } = c.var.deps;`. A middleware types it with `createMiddleware<{ Variables: DepsVariables }>` (`DepsVariables` from `hono-kit`). deps are now built for every request that passes `provideDeps`, not only when a handler reads them. Without `provideDeps`, `c.var.deps` is undefined
- The guard in `auth` must set `currentUser` (was `actor`), and handlers read `c.var.currentUser`. One name: the guard reads the session itself, so nothing else sets it. Rewrite `c.get("actor")` as `c.var.currentUser`, and in your guards `{ actor: Account }` / `c.set("actor", …)` as `{ currentUser: … }` / `c.set("currentUser", …)`

### Changed (template)

- No `withAccount`: reading the session is `sessionUser(headers)` in deps, and `requireAuth` calls it, turns away null with 401 and sets `currentUser`. `buildApp(makeDeps, clock)` lost its `authenticate` argument; tests sign in by swapping `sessionUser` in their `makeDeps` (`appAs` does). `Account` / `AccountId` / `accountId` / `authenticatedAccount` are `CurrentUser` / `UserId` / `userId` / `authenticatedUser`, and a `CurrentUser` holds what the auth provider gives with the session (id, name, email). `test/fixtures.ts` adds `someone()`, a new user per test, since the tests in a file share D1. These live in your app; renaming is optional, but its guards must set `currentUser`

### Docs

- A CSV or a page made from the data is a format listed under 200, not `file()`; `file()` is for a file returned as it is
- Until `sessionUser` reads the session, endpoints behind `requireAuth` answer 401 when called by hand; tests still sign in

## 0.10.0

### Added

- An endpoint can be `index.tsx`, for JSX. `hnk prepare` reads it, lint checks it, and the template's `tsconfig.json` sets `"jsx": "react-jsx"` and `"jsxImportSource": "hono/jsx"`. An existing app adds those two lines and, if it lists files itself, `.tsx` in `.oxlintrc.json`. A directory with both `index.ts` and `index.tsx` stops `hnk prepare`
- Formats chosen by `Accept`: under 200, list media types instead of one schema (`{ "application/json": schema, "text/html": (data: T) => <Page />, "text/markdown": (data: T) => "..." }`). The handler still calls `reply.success(data)` once. With no `Accept` or `*/*` the first one is sent; a client that accepts none gets `406 NOT_ACCEPTABLE` before the handler runs (added to `responses` automatically, like `400`); the response carries `Vary: Accept`. A renderer that does not take what the JSON schema returns is a type error. `hc` sees the JSON one, or a string when there is none; the OpenAPI document lists them all
- An error page for HTML: `app.use("*", errorPage((failure) => ...))` in `src/index.ts` shows the app's one page (or a redirect, `{ redirect: "/login" }`) when a client that asked for HTML gets a failure from an endpoint that returns HTML: `reply.failure`, 401 / 400 / 406 before the handler, and 500. Everyone else still gets the JSON failure. Apps without it do not change
- Files: declare `200: file()` in `responses` and return `reply.success({ body, contentType })`. The file is sent as it is with that `Content-Type` (`application/octet-stream` when left out). `hc` gives the body no type, and the OpenAPI document lists it as binary
- Redirects: declare `303: redirect()` in `responses` and return `reply.redirect(location)`. Always 303 (`redirect()` under another status is a type error). The location must be a path of this app, or on an origin the declaration names (`redirect({ origins: ["https://accounts.google.com"] })`); anything else, `//evil.com` included, throws (500). `hc` sees 303 with no body, and the OpenAPI document a `Location` header
- `hono-kit/vite`: for an app started through Vite, `plugins: [honoKit()]` writes `src/routes.gen.ts` before `vite dev` and `vite build`, and again while dev runs when `src/routes` changes. A broken `src/routes` stops the build

### Breaking

- `reply(200, body)` is `reply.success(body)`. Success is always 200, so it takes no status, like `reply.failure(code)`. Rewrite with `perl -pi -e 's/reply\(200, /reply.success(/g' $(git ls-files 'src/**/*.ts')`
- `hnk gen` is `hnk prepare`, as in Void (where `gen` makes a file to start from). Rename it in `package.json` and `scripts/`
- `src/routes.gen.ts` is no longer committed, as Void's `.void/`; `--check` and `--if-missing` are gone. Add `src/routes.gen.ts` to `.gitignore` and run `git rm --cached src/routes.gen.ts`; make `postinstall` `hnk prepare`, and drop the `--check` from `scripts/check.mjs`
- `scripts/dev.mjs` is gone: Wrangler runs `hnk prepare` itself, before `wrangler dev` and `wrangler deploy` and again while dev runs, so a deploy no longer ships a stale `src/routes.gen.ts`. Add `"build": { "command": "pnpm hnk prepare", "watch_dir": "src/routes" }` to `wrangler.jsonc`, make `dev` `wrangler dev`, and delete `scripts/dev.mjs`

## 0.9.0

hono-kit keeps only the HTTP entry and how to write it; the architecture (domains, services, queries, System) is gone. 0.8.0 is the last version with it.

### Breaking

- Four lint rules are gone: `layer-imports`, `no-foreign-table-reads`, `route-writes-once`, `route-no-domain-failures`. Remove them from `.oxlintrc.json`, or oxlint stops on the unknown rule
- `no-id-cast` now allows `as …Id` only in the file that declares that `…Id` (before: only in a model). An app that declares its ID types in its models passes as is
- `hono-kit/system`, `hono-kit/testing`, `allowSystem` and the `System` type are gone. A webhook checked by its signature uses `auth: allowAnonymous` and checks in the handler
- cron and queue get no actor: `CronContext` is `{ deps, now }`, `QueueContext` is `{ deps, now, body }`
- `hnk gen` no longer writes `makeQueries`. Remove `...makeQueries(db)` from `src/deps.ts`
- `hnk g domain` is gone

### Added

- `hono-kit/lint/recommended.json`: the lint settings of hono-kit's rules (every `hnk/*` rule on `src/**/*.ts`, `import/no-cycle`, `typescript/no-explicit-any`). It ships with the installed version, so a rule added later turns on without editing the app. To use it, replace `.oxlintrc.json` with `{ "extends": ["./node_modules/hono-kit/lint/recommended.json"], "rules": {} }` and keep only your own rules in `rules`. Apps that keep listing rules by hand still work

### Changed

- deps are optional: `provideDeps` and `createWorker`'s `makeDeps` can be left out. Reading deps without them throws an error that says which is missing

### Changed (template)

- A new app has no `src/domains/`. `Account` is in `src/middleware/auth.ts`, tables are in `src/db/schema.ts`, deps return `{ db }`, and `src/db/index.ts` has only `wireDb`. The `vi.mock` ban is gone. Existing apps keep their own files

### Removed

- `examples/invoices` (kept in the 0.8.0 tag)

### Fixed

- A JSON body that cannot be parsed (`{not json`) answered `400 { code: "INTERNAL" }`, a code no endpoint declares. It is now `400 VALIDATION_ERROR` like any other bad input, with Hono's message (`Malformed JSON in request body`). Nothing to change in apps

## 0.8.0

### Breaking

- `createEndpoint` takes the guard in a required `auth` key: `middleware: [requireAuth]` becomes `auth: requireAuth`. Leaving it out is a type error, so a public endpoint writes `auth: allowAnonymous`. `middleware` stays for other middleware and runs after `auth`. Rewrite with `perl -pi -e 's/middleware: \[(\w+(?:\([^)]*\))?)\]( as const)?/auth: $1/' src/routes/**/index.ts`
- The template's `User` is renamed `Account`, because it is not the user record of the auth provider: only who is signed in (an ID, and a role if the rules need one). `src/domains/users/` → `src/domains/accounts/`, `User` → `Account`, `UserId` → `AccountId`, `userId()` → `accountId()`, `authenticatedUser` → `authenticatedAccount`, `withUser` → `withAccount`, `kind: "user"` → `kind: "account"`, the context variable `c.get("user")` → `c.get("account")`. These live in your app, so renaming is optional; the docs use the new names
- The lint `route-declares-auth` is gone (the type does its work). Remove `"hnk/route-declares-auth"` from `.oxlintrc.json`. Guards no longer need names starting with `require` / `allow`
- The middleware in `auth` must set `actor` in its type: `withAccount` (it only sets `account`) or an untyped `createMiddleware(async (c, next) => ...)` is a type error there. `allowAnonymous` now sets `actor: null`; rewrite it in `src/middleware/auth.ts`: `export const allowAnonymous = createMiddleware<{ Variables: { actor: null } }>(async (c, next) => { c.set("actor", null); await next(); });`

### Removed

- The lint `route-lists-are-paged`. Whether a list is paged is up to the app; a paged list still uses `pageQuerySchema` / `pageResponseSchema` / `pageResponse`. Remove `"hnk/route-lists-are-paged"` from `.oxlintrc.json` and the `oxlint-disable-next-line hnk/route-lists-are-paged` lines, or oxlint stops on the unknown rule

### Added

- The lint `hnk/route-no-domain-failures`: a handler does not return a failure from a domain's model itself (`reply.failure(ProfileRequired.code)`, `throw fail(ProfileRequired)`). The rule is the domain's, so its service decides it and the handler returns `result.error`; otherwise the rule does not hold from another entry point. Add `"hnk/route-no-domain-failures": "error"` to `.oxlintrc.json`. A failure only that entry has stays in `_errors.ts`
- Catch-all routes: `src/routes/files/[...path]/index.ts` is `/files/:path{.+}`, one segment or more with slashes. Declare `path` in `request.param`. It must be the last segment, and is registered after the static and `[id]` routes beside it
- `hnk gen --if-missing`: writes `src/routes.gen.ts` only if it does not exist yet; otherwise does nothing. Cannot be combined with `--watch` or `--check`

### Changed (template)

- A new app's `Account` holds only its ID: `orgId`, `role`, `requireRole` and the `admin` / `carol` fixtures are gone, since an app without organizations or roles had to delete them by hand. Add them when your rules need them (examples/invoices has both). Existing apps keep their own files; nothing to change

### Fixed (template)

- `postinstall` ran plain `hnk gen`, which rewrites `src/routes.gen.ts` on every `pnpm install`. On CI (`pnpm install` then `pnpm check`), this silently refreshed a stale committed `routes.gen.ts` before `hnk gen --check` ran, so `--check` always passed even on a stale commit. Change `package.json`: `"postinstall": "hnk gen --if-missing"`

### Fixed

- `hnk gen` stops when two directories end up at the same URL but differ only in a param's name (`[id]` vs `[itemId]`, or `[...path]` vs `[...rest]`), instead of registering both and silently losing the second

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
