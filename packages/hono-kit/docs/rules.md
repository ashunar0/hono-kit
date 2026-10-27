# Rules

The rules every file keeps. Lint stops most of them; the rest are here.

- **Time**: a handler takes `now` from `c.get("now")`; nothing reads the clock (`hnk/no-clock-outside-app-entry`). A thing's times (`createdAt`, `updatedAt`) come from `now` too; a DB default is only for columns the app does not show
- **actor**: the guard in the endpoint's `auth` (required) sets `c.get("actor")`. The type checks it: a middleware whose Variables have no `actor` (`withAccount`, which only loads the session and lets everyone through) cannot be `auth`, nor can an untyped one (`createMiddleware(async (c, next) => ...)` with no type argument). `allowAnonymous` sets `actor: null`. The guards are the app's (`src/middleware/auth.ts`: `requireAuth`, `allowAnonymous`, and what the app adds, such as `requireRole(...)` once its accounts have roles); write them for your auth stack. Other middleware goes in `middleware` and runs after `auth`
  - `actor` is whatever the guard sets, and it is the only name: handlers never read the session's `account`. For a public endpoint that shows the signed-in a little more (their own drafts, whether they liked it), write a guard that lets everyone through and sets `actor` to `Account | null`; do not add another name (`viewer`)
  - **Permissions come in two kinds.** Decided by the role alone (only an admin adds a member): the guard, `auth: requireRole("admin")` (the template has no roles; add `role` to `Account` and the guard). Needs the row, or mixes in an "or" (an admin or the author): all of it in code, after the row is read, returning `err(Forbidden.code)`. Never put half of an "or" in the guard: it would turn away the other half. So `grep` of the guards lists who may call each endpoint
- **Failures**: expected ones (not found, no permission, an external service not answering) are returned as `Result` (`err(NotFound.code)`). Unexpected ones (the DB is down) are thrown
  - 401, 403, 404 are hono-kit standards (`Unauthorized` / `Forbidden` / `NotFound`). Make the others as `{ code, kind, message } as const`, and hono-kit decides the status from `kind`
  - `conflict` (409): it clashes with the thing's current state (taken, already sent, out of stock, a newer version). `unprocessable` (422): the request itself breaks a rule, whatever the state (past the deadline, outside opening hours). A rule of the clock is 422 even when waiting would let it pass: reading again does not change the answer
  - Name a code `<THING>_` + what happened (`INVOICE_NOT_SENDABLE`). A name the docs give is the API's contract: use it as is
  - Clients branch on the `code`, not on 403 / 409 / 422. When a business failure could be more than one kind, make it `conflict` and move on
  - What you cannot see is `NOT_FOUND` (its existence is not revealed); what you can see but may not touch is `FORBIDDEN`
- **Check order**: the guard (401 signed out → 403 a role that may not) → input validation 400 (schema) → NOT_FOUND → FORBIDDEN (a permission that needs the row) → unprocessable → conflict. The guard's 403 does not depend on the ID, so it reveals nothing
- **IDs**: `as …Id` is written only in the file that declares that `…Id` (its maker, `accountId(value)`). Everywhere else calls the maker (`hnk/no-id-cast`)
- **Unique constraints**: the table's `uniqueIndex` decides, never a check you wrote first (two requests can interleave). Wrap the `insert` / `update` in `try/catch`; `uniqueViolationOf(error)` from `hono-kit/sqlite` returns the column it hit (`"members.email"`) or null. Turn each column into its own conflict `Failure`, and rethrow on null. So every column the docs call unique gets its own `uniqueIndex`
- **Returning**: `reply.success(body)` and `reply.failure(code)`. Neither takes a status: success is always 200 (`hnk/route-responds-200`), a failure gets its status from its kind. Create and update return the thing as its GET shows it; delete returns `{ ok: true }`
- **Lists**: a paged list uses these parts (whether a list is paged is up to the app): routes use `pageQuerySchema(filters)` / `pageResponseSchema(item)` / `pageResponse(page, map)` from `hono-kit`. The read takes a `PageQuery`, reads `limit + 1` rows and returns `toPage(...)` from `hono-kit/page`. The cursor compares with `lt` for a newest-first list and `gt` for an oldest-first one
- **Module scope**: keep no changing values there (`let`, a `Map`, an array you push to). One Worker serves concurrent requests, so it would be shared across them (`hnk/no-module-scope-state`). A dummy in tests that collects what was sent takes its array from the test
- **Optional input**: `undefined` in input, `null` in the DB. Normalize with `?? null` before writing
- **Tests**: use the real local D1. HTTP via `request(account, method, path, body, at)` from `test/fixtures.ts`; pass `at` whenever the answer depends on the date

## Do not

- Edit `node_modules/hono-kit`. If something is missing, tell the user
- Copy libs or helpers into the project
- Scatter failure codes as strings (take them from a `Failure` or a hono-kit standard)
