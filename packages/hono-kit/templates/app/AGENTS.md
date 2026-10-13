# AGENTS.md

This is a backend built on [hono-kit](https://github.com/ashunar0/hono-kit): Hono + Cloudflare Workers + D1 + Drizzle + Standard Schema (zod).
hono-kit fixes where things go and what they look like. **The generator produces the shape of a module; do not invent layers.** When unsure, read an existing module and an existing resource under `api/routes/` to the end and write the same way.

## Commands

```sh
pnpm hnk g module <plural camelCase>   # add a module, e.g. invoices, signupRequests
pnpm db:generate                       # after changing a table; writes migrations/ (tests read them)
pnpm exec prettier --write .           # once after editing, before check
pnpm check                             # typecheck, lint, format check, tests
```

**Do not stop until `pnpm check` prints `All checks passed`.** Every lint message says how to fix it. Do not silence lint (the only exception is `route-lists-are-paged`, with a reason).

## Two axes: resources and modules

The nouns in the URL (resources) and the nouns of the domain (modules) are different things, so they live apart.

- **Resources** (`api/routes/<noun>/`): what a client points at. Cut by the URL: one directory per noun, always with `index.ts`. Nested resources are nested directories (`/customers/:customerId/invoices` → `routes/customers/invoices/`). No directories for params (`:id`)
- **Modules** (`api/modules/<name>/`): who keeps which rules. Cut by the rules a thing must keep
- **One way only**: routes use modules; modules know nothing of routes. A route may use as many modules as it needs. One module's code never uses another module's service or repo
- **Shared** (`api/shared/<what>.ts`): pure values and calculations that belong to no domain (dates, times, time zones). Anyone may import them as values; they import only zod. Name the file by what it holds (`time.ts`), never `utils.ts`. Anything that names a thing of this app (a role, a status) belongs to its module, not here. Move something here when a second copy would appear

They often share a word (`routes/invoices/` and `modules/invoices/`) and often do not (`/customers/:customerId/invoices` is a customer's invoices, written with the invoices module). Do not bend one to match the other.

## Adding a module

`pnpm hnk g module <name>` writes the bare shape under `api/modules/<name>/` (`domain / service / repo.d1 / service.test`) and wires it into `api/deps.ts` above the `// hnk:` lines. It is a thing with only `id`, `createdAt` and `updatedAt`, and `get` / `create`. It knows nothing of who is acting. **Grow it into the real thing:**

1. `domain.ts`: fields, `…InputSchema` (zod; `trim()` before checking length), failures (`Failure`), and `reachOf` when someone may touch only some of them (the reach follows the shape of `api/modules/users/domain.ts`)
2. `repo.d1.ts`: columns, `to…` (row → thing), `within` (reach → WHERE), indexes for the list order
3. `service.ts`: the steps, `actor` first. Declare the `…Repository` shape here
4. Run `pnpm db:generate`

The generator writes no resource. Write it where the URL says (next section).

## Adding a resource

Create `api/routes/<noun>/index.ts` by hand. A top noun is mounted in `api/index.ts` (`.route("/invoices", invoicesRouter)`); a child is mounted by its parent (`.route("/:customerId/invoices", customerInvoicesRouter)`). One endpoint looks like this:

```ts
export const invoicesRouter = createRouter().endpoint(
  {
    method: "get",
    path: "/:id",
    middleware: [requireAuth],
    request: { param: z.object({ id: invoiceIdSchema }) },
    responses: { 200: invoiceResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply, { invoices }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");

    const result = await invoices.get(actor, id);
    if (!result.ok) return reply.failure(result.error);

    return reply(200, invoiceResponse(result.value));
  },
);
```

Test it over HTTP (`routes.test.ts`): create, read, list, 400 on bad input, 404 for someone else's, 401 when signed out.

## The shape of a module (three files)

| File         | Side     | Role                                                | May import                                                              |
| ------------ | -------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `domain.ts`  | core     | The thing (What): types, rules, ID brands, failures | zod, `hono-kit/failures` (types), `hono-kit/system` (types)             |
| `service.ts` | core     | The steps (How) and the storage shape they need     | `hono-kit/result`, `hono-kit/failures`, `hono-kit/page` (types), domain |
| `repo.d1.ts` | outbound | Table, D1 implementation, row → thing               | drizzle-orm, `hono-kit/page`, domain, service (types)                   |

Every arrow points to domain. `hnk/layer-imports` enforces this inside modules.

Grow only **when a second one appears**: cron / queue / webhook (`cron.ts` and so on), another store or external API (`gateway.stripe.ts`, `mailer.resend.ts`). **Do not add them up front.**

## The shape of a resource

| File          | Role                                                                       | May import                                                      |
| ------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `index.ts`    | The router: the endpoints of this noun, and `.route(...)` for its children | `hono-kit`, zod, middleware, any module's domain, `response.ts` |
| `response.ts` | How the thing is shown over HTTP: `…ResponseSchema` and `…Response`        | zod, any module's domain (types)                                |

- **Nesting**: the parent mounts the child (`.route("/:customerId/invoices", customerInvoicesRouter)`); the child's `path` is the rest only (`"/"`, `"/:date"`). `request.param` lists every param the handler validates, the parent's too (`{ customerId, id }`). `api/index.ts` mounts only the top nouns (`.route("/customers", customersRouter)`)
- **`response.ts`**: a response is how a thing is shown when sent, not a rule of the thing, so it belongs to the resource. A resource that shows a thing has one, even if only `index.ts` uses it. Another resource showing the same thing imports it (`routes/customers/invoices/` uses `routes/invoices/response.ts`). Small one-off shapes (`{ ok: true }`) stay in `index.ts`
- **IDs**: params use the owner module's `…IdSchema` (`customerIdSchema` from `modules/customers/domain`)
- Routes never import a service or repo; the handler receives services from deps as its third argument (`{ customers, invoices }`)

## Rules

- **service**: arguments go "as whom (`actor`) → what → how → when (`now`)". Never call `new Date()` (only routes read the clock). Never import hono. Knows no HTTP status
- **actor**: over HTTP, `requireAuth` sets `c.get("actor")`. Routes that need no auth use `allowAnonymous`. Only guards read `user`
- **Failures**: expected ones (not found, no permission, an external service not answering) are returned as `Result` (`err(NotFound.code)`). Unexpected ones (the DB is down) are thrown
  - 401, 403, 404 are hono-kit standards (`Unauthorized` / `Forbidden` / `NotFound`, imported from `hono-kit`)
  - A failure of this thing goes in **domain.ts** as `{ code, kind, message } as const`. `kind` is `unauthenticated / forbidden / notFound / conflict / unprocessable / upstream` (hono-kit decides the status). `conflict` (409): it clashes with the thing's current state (taken, already sent, a newer version). `unprocessable` (422): the request itself breaks a rule, whatever the state (past the deadline, outside opening hours). service returns `err(NotDraft.code)`
  - Declare `...errorResponses(NotFound, NotDraft)` in the route's `responses`; the handler returns `reply.failure(result.error)`
  - What you cannot see is `NOT_FOUND` (its existence is not revealed); what you can see but may not touch is `FORBIDDEN`
  - Entry-point-only failures (a webhook signature, ...) go in the module's `errors.ts` as `httpError(code, status, message)` (where they go now that routes left modules is not decided)
- **Entry checks** (the customer in the URL exists → 404, ...): write them in each handler, in order, as plain calls (`const customer = await customers.get(customerId); if (!customer.ok) return reply.failure(customer.error);`). Do not hide them in middleware, even when the same lines repeat. A handler may take the services of several modules from deps (`{ customers, invoices }`). Ask "is this check needed when cron calls it too?": if not (404 for an ID in the URL), it goes in the handler; if so (permission, a rule across things), it stays in service. When the check itself grows (exists and is not archived), add one function to the owner's service and still call it from each handler
- **Writes**: a handler of a user's request may read from as many services as it needs, but writes through **one call to one service**. Never write through two services in a row (each is its own batch; if the second fails, the first stays half done). Writes that must happen together go inside that one service call, in one batch. Something that must follow in another module is recorded in your own table in the same batch (an outbox) and delivered later by cron or a queue. Entry points that retry (webhook, queue, cron) may write to several modules in order, if every write gives the same result however many times it runs. Details: `node_modules/hono-kit/docs/cross-module.md`
- **One repo call writes all or nothing**: when it writes more than one statement (a thing and its child rows, a state change and its outbox row), pass `batch` (`wireBatch(db)` in `api/deps.ts`) to the repo next to the scopes, and run the statements built by the scopes as one batch. The batch builds nothing itself, so a repo still writes only its own module's tables. Many rows go in with `scope.insertMany(rows)` (D1 binds at most 100 values in a statement, so it splits them into as many statements as needed; spread them into the batch). D1 has no transaction that reads and decides midway: a batch is fixed before it is sent. A condition like "only if the update above won" goes into SQL (`scope.insertFrom(...)` with a `WHERE` on the row the update set)
- **Returning**: `reply(200, body)` and `reply.failure(...)`. Never `c.json` (lint stops it). Create returns the created thing with 200. Delete returns `{ ok: true }` with 200
- **IDs**: only the domain's `…Id` function applies the brand with `as`. Inputs use `…IdSchema`. Never write `as …Id` elsewhere (`no-id-cast`)
- **Input**: only values that passed a schema with zod's `.brand<"…Input">()` reach service
- **Lists**: `pageQuerySchema(filters)` / `pageResponseSchema(item)` / `pageResponse(page, map)`. The repo takes a `PageQuery`, reads `limit + 1` rows and returns `toPage(...)`. Never write an unbounded list
  - Filters: service declares `type …ListQuery = PageQuery & { status?: …Status }`, and the repo's `listWithin(reach, query)` takes it. routes accepts `pageQuerySchema(z.object({ status: …StatusSchema.optional() }))` and passes it straight through
- **Reach**: put "someone else's" into the WHERE and do it in one statement (`updateWithin` / `deleteWithin` / `findWithin`). Never check first and write in a second statement
- **Enums**: domain holds an `as const` array (`…Statuses`) and a zod enum (`…StatusSchema`); the repo's `text("status", { enum: …Statuses })` and the routes schema use the same ones. `row.status` comes back typed, so no parsing
- **Check order**: input validation 400 (schema) → NOT_FOUND → FORBIDDEN → unprocessable → conflict. Broken input is a 400 before any state is looked at. A rule that means something only in some states (a cancel deadline means nothing for a finished visit) goes after the state check, so the answer is first that the thing cannot be done at all
- **Dates without time**: a text column holding `YYYY-MM-DD`. Validate with `z.iso.date()` (it checks the calendar too: `2026-02-30` fails; `new Date("2026-02-30")` would quietly become March 2). Put the schema and date math (`from + 7 days`) in `api/shared/` as pure functions; never read the current time there
- **Optional input**: `undefined` in input, `null` in the DB. Normalize with `?? null` in service. PUT replaces everything, so omitted optional fields are overwritten with null
- **Aggregates**: put them in the module that owns the table being counted, with that module's reach. A GET that returns an array hits `route-lists-are-paged`; when the size is bounded elsewhere, put `// oxlint-disable-next-line hnk/route-lists-are-paged -- reason` **right above** the `path:` line (it does not work above `.endpoint(`). Fixed paths like `/weekly` go before `/:id`
- **Unique constraints**: let the table's `uniqueIndex` decide (reading first and then writing can be interleaved). Wrap the repo's `insert` / `updateWithin` in `try/catch`; if `isUniqueViolation(error)` from `api/db/errors` is true, return a failure value (rethrow otherwise), and service turns it into the domain's conflict `Failure`. Do not write your own check. When a repo returns both "absent" and "duplicate", return a union with a string literal that cannot be confused with the thing (`Subject | "nameTaken" | null`). Test DBs are shared between calls, so use fresh unique values (`crypto.randomUUID()`)
- **Times on things**: `createdAt` / `updatedAt` also come from `now`

## Things whose state moves (draft → sent, ...)

- A transition that is not allowed is a domain failure `{ code: "…_NOT_STARTABLE", kind: "conflict", message }`. When the docs do not name the code, make it `<THING>_` + what happened; a name the docs give is the API's contract, so use it as is
- Transitions are `POST /:id/<verb>` on the thing's resource router. The repo may add `transitionWithin(id, reach, from, changes)`: one statement with `WHERE id AND status = from AND within(reach)`; if it returns null, another request moved first, so return the same conflict
- service does `findWithin` (NOT_FOUND if absent) → a check (a pure domain function such as `canStart(x)`) → `transitionWithin`

## Read before you…

- **use another module**: `node_modules/hono-kit/docs/cross-module.md` (reading and writing across modules, outbox, entry points that retry, IDs from other modules, things under a parent)
- **add cron, queue, webhook, mailer or gateway, or replace them in tests**: `node_modules/hono-kit/docs/inbound-outbound.md`

## When a request touches several modules

Modules do not call each other, and `api/deps.ts` only builds each module (no shapes wired between them). The handler does the joining:

1. **Read** from as many services as needed (`customers.get`, `products.pick`). A missing thing named in the URL is a 404 returned right there (see Entry checks)
2. **Pass** what was read to the one writing service as values. That service declares the shape it takes (`type Billed = { customer: { id; organizationId }; items: { id; organizationId; price }[] }`), not another module's types
3. **The writing service checks that the values belong together** before deciding (every product is of the customer's organization). Rules that must hold from every entry point stay in service, so a wrong value from the handler cannot slip through
   - Values that came from the client (product ids in the body) and do not match → a domain failure (`PRODUCT_NOT_FOUND`)
   - Values the handler read from the DB that do not match → a bug: `throw`

Inside a module, another module's ID is a plain `string` (`Invoice.customerId`). Another module's table is used only inside foreign-key `references()`.

## When unsure

| Question               | Rule                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| String input           | Always `trim()` before checking length                                                                                                                                                                   |
| Foreign key `onDelete` | `cascade` if children go away with the parent                                                                                                                                                            |
| Where tests go         | HTTP tests for one module's things in `modules/<name>/routes.test.ts` for now. Lines across modules and the whole app go in `test/`. Use the real local D1. HTTP via `request(user, method, path, body)` |
| Route without auth     | `middleware: [allowAnonymous]` (always write it, so it differs from forgetting)                                                                                                                          |
| Adding cron / queue    | Pass them to `createWorker({ makeDeps, fetch, scheduled, queue })`. Handlers receive `{ deps, actor, now }`                                                                                              |
| Migrations             | `pnpm db:generate`. Do not run prettier on `migrations/meta`                                                                                                                                             |

## Do not

- Edit `node_modules/hono-kit`. If something is missing, tell the user
- Copy libs or helpers into the project. Never write `new Hono()` directly (use `createRouter()`)
- Add layers or ports ahead of time. Wait until the trigger happens
- Scatter failure codes as strings (take them from a domain `Failure` or a hono-kit standard)
- Name types after TS built-ins (`Record`, `Map`, `Set`, `Error`). For a module named `records`, call the thing `Entry` or similar (`Record<K, V>` would be shadowed)
- Change the shape for looks. Keep the shapes above and rewrite the contents
