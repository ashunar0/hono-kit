# AGENTS.md

This is a backend built on [hono-kit](https://github.com/ashunar0/hono-kit): Hono + Cloudflare Workers + D1 + Drizzle + Standard Schema (zod).
hono-kit fixes where things go and what they look like. **The generator produces the shape of a domain; do not invent layers.** When unsure, read an existing domain and an existing resource under `src/routes/` to the end and write the same way.

## Commands

```sh
pnpm hnk g domain <plural camelCase>   # add a domain, e.g. invoices, signupRequests
pnpm db:generate                       # after changing a table; writes migrations/ (tests read them)
pnpm exec prettier --write .           # once after editing, before check
pnpm check                             # typecheck, lint, format check, tests
```

**Do not stop until `pnpm check` prints `All checks passed`.** Every lint message says how to fix it. Do not silence lint (the only exception is `route-lists-are-paged`, with a reason).

## Read before you…

- **make a thing whose state moves** (draft → sent), or an enum: `node_modules/hono-kit/docs/state.md`
- **use another domain** (read or write across domains, read another domain's table in SQL, count rows, outbox, entry points that retry, things under a parent): `node_modules/hono-kit/docs/cross-domain.md`
- **add cron, queue, webhook, mailer or gateway, or replace them in tests**: `node_modules/hono-kit/docs/inbound-outbound.md`

## Two axes: resources and domains

The nouns in the URL (resources) and the nouns of the domain (domains) are different things, so they live apart.

- **Resources** (`src/routes/<noun>/`): what a client points at. Cut by the URL: one directory per noun, always with `index.ts`. Nested resources are nested directories (`/customers/:customerId/invoices` → `routes/customers/invoices/`). No directories for params (`:id`)
- **Domains** (`src/domains/<name>/`): who keeps which rules. Cut by the rules a thing must keep
- **Jobs** (`src/jobs/<name>.ts`): entry points that are not HTTP (cron, a queue). Named by what starts them (`daily.ts`, `reminders-queue.ts`). Like resources, they live outside domains and receive services from deps
- **One way only**: entry points (routes and jobs) use domains; domains know nothing of them. A route may use as many domains as it needs. One domain's code never uses another domain's service; the handler joins them
- **Lib** (`src/lib/<what>.ts`): code that knows nothing of this app's business, so it could move to another app as is (dates, times, time zones). Name the file by what it holds (`time.ts`), never `utils.ts`. Anything that names a thing of this app (a role, a status) belongs to its domain. Move something here when a second copy would appear

They often share a word (`routes/invoices/` and `domains/invoices/`) and often do not (`/customers/:customerId/invoices` is a customer's invoices, written with the invoices domain). Do not bend one to match the other.

## Reads and writes

There are two paths.

```
write (POST, PATCH, DELETE): route → service → model → repo    keeps the rules
read (GET):                  route → queries → …Within          keeps the reach
```

What a GET returns is the resource's business, so the read lives next to the resource (`src/routes/<noun>/queries.<tech>.ts`).

- queries take db as `ReadDb` (SELECT only). Build them in `src/deps.ts` (`invoiceQueries: invoicesQueries(db)`); the handler receives them from deps
- Never read a table directly. Read through the `…Within` its owner's repo exports (`hnk/no-foreign-table-reads`). When what is seen depends on who looks, take `actor` and pass it on (`invoicesWithin(db, actor)`): who sees what stays inside the owner. A number that is the same whoever looks comes from a window that takes no actor
- Return the screen's row type (`InvoiceRow`). When you return the select as is, infer the type from the select; write it by hand only for a shape you put together in JS (a summary merged from several selects). Make no rules; borrow them from model when needed (`todayOf`)
- Reads before a write (an entry check, materials for the decision) go through services. The read after a write, to show the result, goes through queries: a POST or PATCH returns what the GET of that thing returns. If it is gone right after the write, throw
- A write service does not return the thing for showing, only what the caller needs to act next: the ID for a create, otherwise `void`. Showing is the job of queries
- A read a rule needs (counting before deciding) stays in the domain's repo
- A handler may use any queries from deps, not only its own noun's: `GET /customers/:customerId/invoices` reads through `invoiceQueries` and shows them with `routes/invoices/response.ts`

## Adding a domain

A domain's line is the line of what is written together. Tables that must never be written one without the other (an invoice and its line items) go in one domain, written in one call. What may catch up a little later (a mail when an invoice is sent) goes in another domain, joined through an outbox. The generator writes a domain with one table; add more tables when they belong together.

`pnpm hnk g domain <name>` writes the bare shape under `src/domains/<name>/` (`model / service / repo.d1 / service.test`) and wires it into `src/deps.ts` above the `// hnk:` lines. It is a thing with only `id`, `createdAt` and `updatedAt`, and `get` / `create`. **Grow it into the real thing:**

1. `model.ts`: fields, `…InputSchema` (zod; `trim()` before checking length), failures (`Failure`), `reachOf(actor)` when someone may touch only some of them (a union such as `{ kind: "all" } | { kind: "own"; userId: string }`), and `may…(actor, thing)` when a permission needs the row
2. `repo.d1.ts`: columns, `to…` (row → thing), `within` (reach → WHERE), the `…Within(db, actor)` window the reads go through, indexes for the list order
3. `service.ts`: the steps. Declare the `…Repository` shape here
4. Run `pnpm db:generate`

| File         | Role                                                |
| ------------ | --------------------------------------------------- |
| `model.ts`   | The thing (What): types, rules, ID brands, failures |
| `service.ts` | The steps (How) and the adapter shapes they need    |
| `repo.d1.ts` | Adapter: table, D1 implementation, row → thing      |

Every arrow points to model and service: adapters (repo, gateway, mailer, queue) fulfill the shapes service declares. `hnk/layer-imports` says what each file may import. Grow only **when a second one appears**: another adapter (`gateway.stripe.ts`, `mailer.resend.ts`). **Do not add them up front.**

## Adding a resource

The generator writes no resource. Create `src/routes/<noun>/index.ts` by hand. A top noun is mounted in `src/index.ts` (`.route("/invoices", invoicesRouter)`); a child is mounted by its parent (`.route("/:customerId/invoices", customerInvoicesRouter)`), its `path` is the rest only (`"/"`, `"/:date"`), and `request.param` lists the parent's param too (`{ customerId, id }`). One endpoint looks like this:

```ts
export const invoicesRouter = createRouter().endpoint(
  {
    method: "get",
    path: "/:id",
    middleware: [requireAuth],
    request: { param: z.object({ id: invoiceIdSchema }) },
    responses: { 200: invoiceResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply, { invoiceQueries }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");

    const invoice = await invoiceQueries.get(actor, id);
    if (invoice === null) return reply.failure(NotFound.code);

    return reply(200, invoiceResponse(invoice));
  },
);
```

| File            | Role                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `index.ts`      | The router: the endpoints of this noun, and `.route(...)` for its children      |
| `response.ts`   | How the thing is shown over HTTP: `…ResponseSchema` and `…Response`             |
| `errors.ts`     | Failures only this entry point has (a webhook signature, ...). Only when needed |
| `queries.d1.ts` | The reads of the GET endpoints (see "Reads and writes")                         |

- **`response.ts`**: a response is how a thing is shown when sent, not a rule of the thing, so it belongs to the resource. It takes the row type of queries (`InvoiceRow`), not the domain thing. A resource that shows a thing has one, even if only `index.ts` uses it. Another resource showing the same thing imports it. Small one-off shapes (`{ ok: true }`) stay in `index.ts`
- **IDs** in params and bodies use the owner domain's `…IdSchema` (`customerIdSchema` from `domains/customers/model`)
- **Tests** go over HTTP next to the resource (`src/routes/<noun>/index.test.ts`): create, read, list, 400 on bad input, 404 for someone else's, 403 for a role that may not, 401 when signed out

## Rules

- **service**: arguments go "as whom (`actor`) → what → how → when (`now`)". Knows no HTTP status. A handler takes `now` from `c.get("now")`; nothing reads the clock (`hnk/no-clock-outside-app-entry`)
- **actor**: the guard sets `c.get("actor")` (every endpoint declares one: `requireAuth`, `requireRole(...)` or `allowAnonymous`). When no rule of the app depends on who is acting (no sign-in, no reach), services take no `actor`; add it when sign-in arrives
  - `User` holds only who is signed in and the role. A business person (a member, a staff, a patient) is a row of its own domain that holds `userId`; never put a business row's ID on `User` (a session keeps an old ID after the row is deleted). A reach of "only their own" goes through that row
  - **Permissions come in two kinds.** Decided by the role alone (only an admin adds a member): the guard, `middleware: [requireRole("admin")]`. Needs the row, or mixes in an "or" (an admin or the author): all of it in service, as a pure function in model (`mayCancel(actor, reservation)`) and `err(Forbidden.code)`. Never put half of an "or" in the guard: it would turn away the other half. So `grep` of the guards lists who may call each endpoint; compare it with the permission table of the docs
- **Failures**: expected ones (not found, no permission, an external service not answering) are returned as `Result` (`err(NotFound.code)`). Unexpected ones (the DB is down) are thrown
  - 401, 403, 404 are hono-kit standards (`Unauthorized` / `Forbidden` / `NotFound`). A failure of this thing goes in **model.ts** as `{ code, kind, message } as const`, and hono-kit decides the status from `kind`
  - `conflict` (409): it clashes with the thing's current state (taken, already sent, out of stock, a newer version). `unprocessable` (422): the request itself breaks a rule, whatever the state (past the deadline, outside opening hours). A rule of the clock is 422 even when waiting would let it pass: reading again does not change the answer
  - What you cannot see is `NOT_FOUND` (its existence is not revealed); what you can see but may not touch is `FORBIDDEN`
- **Check order**: the guard (401 signed out → 403 a role that may not) → input validation 400 (schema) → NOT_FOUND → FORBIDDEN (a permission that needs the row) → unprocessable → conflict. The guard's 403 does not depend on the ID, so it reveals nothing
- **Entry checks** (the customer in the URL exists → 404): write them in each handler, in order, as plain calls. Do not hide them in middleware, even when the same lines repeat. Ask "is this check needed when cron calls it too?": if not, it goes in the handler; if so (a permission that needs the row, a rule across things), it stays in service
- **Writes**: a handler of a user's request may read from as many services as it needs, but writes through **one call to one service**. Never write through two services in a row: if the second fails, the first stays half done. Name a service's reads `get…` or `list…`: any other call is counted as a write (`hnk/route-writes-once`; a webhook behind `allowSystem` is not counted). One repo call writes all or nothing (the repo receives `batch` from `wireBatch(db)` when it writes several statements)
- **Reach**: put "someone else's" into the WHERE and do it in one statement (`find(reach, id)` / `update(reach, id, changes)` / `delete(reach, id)`). Never check first and write in a second statement. Repo methods take `reach` first
- **Unique constraints**: the table's `uniqueIndex` decides, never a check you wrote first (two requests can interleave). Wrap the repo's `insert` / `update` in `try/catch`; `uniqueViolationOf(error)` from `hono-kit/sqlite` returns the column it hit (`"members.email"`) or null. Return a failure value per column (rethrow on null), and service turns each into the domain's conflict `Failure`. So every column the docs call unique gets its own `uniqueIndex`
- **Returning**: `reply(200, body)` and `reply.failure(...)`. Create and update return the thing as its GET shows it, read again through queries, with 200; delete returns `{ ok: true }` with 200
- **Lists**: routes use `pageQuerySchema(filters)` / `pageResponseSchema(item)` / `pageResponse(page, map)` from `hono-kit`. queries take a `PageQuery` (and declare `type …ListQuery = PageQuery & { status?: …Status }`), read `limit + 1` rows and return `toPage(...)` from `hono-kit/page`
- **Optional input**: `undefined` in input, `null` in the DB. Normalize with `?? null` in service

## When unsure

| Question       | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where tests go | HTTP tests next to the resource. Tests of model and service stay in the domain (`service.test.ts`), even when they need rows of other domains: make those rows through the other domains' services. Lines across domains, the whole app and `src/lib/` go in `test/`. Use the real local D1. HTTP via `request(user, method, path, body, at)`; pass `at` whenever the answer depends on the date. To act as the system, use `systemActor` from `hono-kit/testing` |

## Do not

- Edit `node_modules/hono-kit`. If something is missing, tell the user
- Copy libs or helpers into the project
- Scatter failure codes as strings (take them from a domain `Failure` or a hono-kit standard)
- Change the shape for looks. Keep the shapes above and rewrite the contents
