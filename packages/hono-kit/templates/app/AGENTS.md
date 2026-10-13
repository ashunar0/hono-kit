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

## Two axes: resources and domains

The nouns in the URL (resources) and the nouns of the domain (domains) are different things, so they live apart.

- **Resources** (`src/routes/<noun>/`): what a client points at. Cut by the URL: one directory per noun, always with `index.ts`. Nested resources are nested directories (`/customers/:customerId/invoices` → `routes/customers/invoices/`). No directories for params (`:id`)
- **Domains** (`src/domains/<name>/`): who keeps which rules. Cut by the rules a thing must keep
- **Jobs** (`src/jobs/<name>.ts`): entry points that are not HTTP (cron, a queue). Named by what starts them, as a resource is named by its URL (`daily.ts`, `reminders-queue.ts`); more work on the same trigger goes in the same file. Like resources, they live outside domains and receive services from deps
- **One way only**: entry points (routes and jobs) use domains; domains know nothing of them. A route may use as many domains as it needs. One domain's code never uses another domain's service. From another domain's repo it takes only the table for a foreign key and the read window `…Within` (see "Reading another domain's table")
- **Lib** (`src/lib/<what>.ts`): code that knows nothing of this app's business, so it could move to another app as is (dates, times, time zones). Anyone may import it as values; it imports only zod and other lib files. Name the file by what it holds (`time.ts`), never `utils.ts`. Anything that names a thing of this app (a role, a status) belongs to its domain, not here. Move something here when a second copy would appear

They often share a word (`routes/invoices/` and `domains/invoices/`) and often do not (`/customers/:customerId/invoices` is a customer's invoices, written with the invoices domain). Do not bend one to match the other.

## Adding a domain

`pnpm hnk g domain <name>` writes the bare shape under `src/domains/<name>/` (`model / service / repo.d1 / service.test`) and wires it into `src/deps.ts` above the `// hnk:` lines. It is a thing with only `id`, `createdAt` and `updatedAt`, and `get` / `create`. It knows nothing of who is acting. **Grow it into the real thing:**

1. `model.ts`: fields, `…InputSchema` (zod; `trim()` before checking length), failures (`Failure`), `reachOf` when someone may touch only some of them (the reach follows the shape of `src/domains/users/model.ts`), and `may…(actor, thing)` when a permission needs the row (see actor in Rules)
2. `repo.d1.ts`: columns, `to…` (row → thing), `within` (reach → WHERE), indexes for the list order
3. `service.ts`: the steps, `actor` first. Declare the `…Repository` shape here
4. Run `pnpm db:generate`

The generator writes no resource. Write it where the URL says (next section).

## Adding a resource

Create `src/routes/<noun>/index.ts` by hand. A top noun is mounted in `src/index.ts` (`.route("/invoices", invoicesRouter)`); a child is mounted by its parent (`.route("/:customerId/invoices", customerInvoicesRouter)`). One endpoint looks like this:

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

Test it over HTTP next to the resource (`src/routes/<noun>/index.test.ts`): create, read, list, 400 on bad input, 404 for someone else's, 403 for a role that may not, 401 when signed out.

## The shape of a domain (three files)

| File         | Side     | Role                                                |
| ------------ | -------- | --------------------------------------------------- |
| `model.ts`   | core     | The thing (What): types, rules, ID brands, failures |
| `service.ts` | core     | The steps (How) and the storage shape they need     |
| `repo.d1.ts` | outbound | Table, D1 implementation, row → thing               |

Every arrow points to model. `hnk/layer-imports` enforces what each file may import, and its message says what is allowed.

Grow only **when a second one appears**: another store or external API (`gateway.stripe.ts`, `mailer.resend.ts`). **Do not add them up front.** Entry points other than HTTP (cron, a queue) are not part of a domain: they go in `src/jobs/`

## The shape of a resource

| File          | Role                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| `index.ts`    | The router: the endpoints of this noun, and `.route(...)` for its children      |
| `response.ts` | How the thing is shown over HTTP: `…ResponseSchema` and `…Response`             |
| `errors.ts`   | Failures only this entry point has (a webhook signature, ...). Only when needed |

- **Nesting**: the parent mounts the child (`.route("/:customerId/invoices", customerInvoicesRouter)`); the child's `path` is the rest only (`"/"`, `"/:date"`). `request.param` lists every param the handler validates, the parent's too (`{ customerId, id }`). `src/index.ts` mounts only the top nouns (`.route("/customers", customersRouter)`)
- **`response.ts`**: a response is how a thing is shown when sent, not a rule of the thing, so it belongs to the resource. A resource that shows a thing has one, even if only `index.ts` uses it. Another resource showing the same thing imports it (`routes/customers/invoices/` uses `routes/invoices/response.ts`). Small one-off shapes (`{ ok: true }`) stay in `index.ts`
- **IDs**: params use the owner domain's `…IdSchema` (`customerIdSchema` from `domains/customers/model`)

## Rules

- **service**: arguments go "as whom (`actor`) → what → how → when (`now`)". Only entry points read the clock. Knows no HTTP status. The handler receives services from deps as its third argument (`{ customers, invoices }`)
- **actor**: over HTTP, `requireAuth` sets `c.get("actor")`. Routes that need no auth use `allowAnonymous`. Only guards read `user`. When no rule of the app depends on who is acting (no sign-in, no reach), services take no `actor`, as the generator writes them; add it when sign-in arrives
  - `User` holds only who is signed in and the role. A business person (a member, a staff, a patient) is a row of its own domain that holds `userId`; never put a business row's ID on `User` (a session keeps an old ID after the row is deleted). A reach of "only their own" goes through that row
  - **Permissions come in two kinds.** Decided by the role alone (only a librarian adds a book): the endpoint's guard, `middleware: [requireRole("librarian")]`, in place of `requireAuth` (still one guard per endpoint). Needs the row, or mixes in an "or" (a librarian or the member themself): all of it in service, as a pure function in model (`mayCancel(actor, reservation)`) and `err(Forbidden.code)` from service. Never put half of an "or" in the guard: it would turn away the other half
  - So `grep` of the guards lists who may call each endpoint. Compare it with the permission table of the docs
- **Failures**: expected ones (not found, no permission, an external service not answering) are returned as `Result` (`err(NotFound.code)`). Unexpected ones (the DB is down) are thrown
  - 401, 403, 404 are hono-kit standards (`Unauthorized` / `Forbidden` / `NotFound`, imported from `hono-kit`)
  - A failure of this thing goes in **model.ts** as `{ code, kind, message } as const`. `kind` is `unauthenticated / forbidden / notFound / conflict / unprocessable / upstream` (hono-kit decides the status). `conflict` (409): it clashes with the thing's current state (taken, already sent, a newer version). `unprocessable` (422): the request itself breaks a rule, whatever the state (past the deadline, outside opening hours). A rule of the clock is 422 even when waiting would let it pass (too early to record a no-show): reading again does not change the answer. service returns `err(NotDraft.code)`
  - Declare `...errorResponses(NotFound, NotDraft)` in the route's `responses`; the handler returns `reply.failure(result.error)`
  - What you cannot see is `NOT_FOUND` (its existence is not revealed); what you can see but may not touch is `FORBIDDEN`
  - Entry-point-only failures (a webhook signature, ...) go next to that entry point in `src/routes/<noun>/errors.ts` as `httpError(code, status, message)`. A domain has no `errors.ts`
- **Entry checks** (the customer in the URL exists → 404, ...): write them in each handler, in order, as plain calls (`const customer = await customers.get(customerId); if (!customer.ok) return reply.failure(customer.error);`). Do not hide them in middleware, even when the same lines repeat. A handler may take the services of several domains from deps (`{ customers, invoices }`). Ask "is this check needed when cron calls it too?": if not (404 for an ID in the URL), it goes in the handler; if so (a permission that needs the row, a rule across things), it stays in service. A permission the role alone decides is the guard's (see actor). When the check itself grows (exists and is not archived), add one function to the owner's service and still call it from each handler
- **Writes**: a handler of a user's request may read from as many services as it needs, but writes through **one call to one service**. Never write through two services in a row (each is its own batch; if the second fails, the first stays half done). Writes that must happen together go inside that one service call, in one batch (one repo call writing several statements: `node_modules/hono-kit/docs/pitfalls.md`). Something that must follow in another domain is recorded in your own table in the same batch (an outbox) and delivered later by cron or a queue. Entry points that retry (webhook, queue, cron) may write to several domains in order, if every write gives the same result however many times it runs. Details: `node_modules/hono-kit/docs/cross-domain.md`
- **Returning**: `reply(200, body)` and `reply.failure(...)`. Create returns the created thing with 200. Delete returns `{ ok: true }` with 200
- **Lists**: routes use `pageQuerySchema(filters)` / `pageResponseSchema(item)` / `pageResponse(page, map)` from `hono-kit`. The repo takes a `PageQuery`, reads `limit + 1` rows and returns `toPage(...)` from `hono-kit/page` (types and pure functions only; the HTTP shapes are not there). Never write an unbounded list
  - Filters: service declares `type …ListQuery = PageQuery & { status?: …Status }`, and the repo's `list(reach, query)` takes it. routes accepts `pageQuerySchema(z.object({ status: …StatusSchema.optional() }))` and passes it straight through. A yes/no filter is `z.stringbool().optional()` (`?available=true`, `?available=false`)
- **Reach**: put "someone else's" into the WHERE and do it in one statement (`find(reach, id)` / `update(reach, id, changes)` / `delete(reach, id)`). Never check first and write in a second statement
  - Repo methods take `reach` first and carry no `Within` in their names. With no reach yet, there is no argument; when it arrives, add the argument and keep the name (types point at every caller). `…Within` names only the window another domain reads (see "Reading another domain's table")
- **Enums**: model holds an `as const` array (`…Statuses`) and a zod enum (`…StatusSchema`); the repo's `text("status", { enum: …Statuses })` and the routes schema use the same ones. `row.status` comes back typed, so no parsing
- **Check order**: the guard (401 signed out → 403 a role that may not) → input validation 400 (schema) → NOT_FOUND → FORBIDDEN (a permission that needs the row) → unprocessable → conflict. The guard runs before the schema, so a role that may not gets 403 whatever it sent; this reveals nothing, since the answer does not depend on the ID. Broken input is a 400 before any state is looked at. A rule that means something only in some states (a cancel deadline means nothing for a finished visit) goes after the state check, so the answer is first that the thing cannot be done at all
- **Optional input**: `undefined` in input, `null` in the DB. Normalize with `?? null` in service. PUT replaces everything, so omitted optional fields are overwritten with null
- **Aggregates**: put them in the domain that owns the table being counted. Then ask "should this number change with who is looking?" If so (the loans a member sees as their own), use the owner's reach. If not (copies a book has left to lend, a count a rule decides by), use no reach and take no `actor`. A reach narrows what is shown, never what a rule computes. Fixed paths like `/weekly` go before `/:id`
- **Unique constraints**: the table's `uniqueIndex` decides, never a check you wrote first (two requests can interleave). Turn the violation into the domain's conflict `Failure`. How: `node_modules/hono-kit/docs/pitfalls.md`

## Things whose state moves (draft → sent, ...)

- A transition that is not allowed is a domain failure `{ code: "…_NOT_STARTABLE", kind: "conflict", message }`. When the docs do not name the code, make it `<THING>_` + what happened; a name the docs give is the API's contract, so use it as is
- Transitions are `POST /:id/<verb>` on the thing's resource router. The repo may add `transition(reach, id, from, changes)`: one statement with `WHERE id AND status = from AND within(reach)`; if it returns null, another request moved first, so return the same conflict
- service does `find` (NOT_FOUND if absent) → a check (a pure function in model such as `canStart(x)`) → `transition`

## Read before you…

- **use another domain**: `node_modules/hono-kit/docs/cross-domain.md` (reading and writing across domains, outbox, entry points that retry, IDs from other domains, things under a parent)
- **add cron, queue, webhook, mailer or gateway, or replace them in tests**: `node_modules/hono-kit/docs/inbound-outbound.md`
- **write several statements in one repo call, a unique constraint, dates without time, a test that compares an order, or a count of another table's rows per row**: `node_modules/hono-kit/docs/pitfalls.md`

## When a request touches several domains

Domains do not call each other, and `src/deps.ts` only builds each domain (no shapes wired between them). The handler does the joining:

1. **Read** from as many services as needed (`customers.get`, `products.pick`). A missing thing named in the URL is a 404 returned right there (see Entry checks). When the next thing is named by something read rather than by the URL (the customer of an invoice), read the first through its own service, then the next. The writing service still reads its own thing again to decide: what the handler read may have moved since
2. **Pass** what was read to the one writing service as values. That service declares the shape it takes (`type Billed = { customer: { id; organizationId }; items: { id; organizationId; price }[] }`), not another domain's types
3. **The writing service checks that the values belong together** before deciding (every product is of the customer's organization). Rules that must hold from every entry point stay in service, so a wrong value from the handler cannot slip through
   - Values that came from the client (product ids in the body) and do not match → a domain failure (`PRODUCT_NOT_FOUND`)
   - Values the handler read from the DB that do not match → a bug: `throw`

Inside a domain, another domain's ID is a plain `string` (`Invoice.customerId`).

## Reading another domain's table

When one SQL statement must look at another domain's table (a filter or an order that needs it, together with paging), read it through the window its owner exports: `…Within`, a subquery of the rows the reader may see. When the handler can read each domain and put the answers together (the copies on loan of the one book it shows), do that. But when any variant of a list (one of its filters) needs the other table in one statement, the whole list, every variant, is answered by the domain that reads the window. Do not split one list into two ways of reading.

```ts
// domains/invoices/repo.d1.ts: the owner decides which rows may be seen
export const invoicesWithin = (db: ReadDb, actor: Actor) =>
  db
    .select()
    .from(invoicesTable)
    .where(within(reachOf(actor)))
    .as("invoices_within");

// domains/payments/repo.d1.ts: the reader joins it like a table
const invoices = invoicesWithin(scope.reads, actor);
const rows = await scope.reads
  .select()
  .from(paymentsTable)
  .innerJoin(invoices, eq(invoices.id, paymentsTable.invoiceId));
```

- **Read the way the foreign key points**: the domain whose table references the other reads it (payments references invoices, so payments reads `invoicesWithin`). The other way round makes the imports a cycle, and `import/no-cycle` stops it. A list under the other's URL is still answered by the referencing domain: `GET /books?available=true` (books with a copy not on loan) is read by loans, which references books, and the books handler calls the loans service
- The window takes `actor` when the owner has a reach. When every row is visible to everyone, it takes only `db`
- Conditions whose meaning the owner decides (what a search word matches) are the owner's: the window takes them (`booksWithin(db, { q })`) and applies them inside. The reader adds only conditions on its own table (copies on loan)
- Another domain's table itself (`invoicesTable`) is used only inside foreign-key `references()` (`hnk/no-foreign-table-reads`)

## When unsure

| Question            | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where tests go      | HTTP tests next to the resource they test (`src/routes/<noun>/index.test.ts`). Tests of model and service stay in the domain (`service.test.ts`), even when they need rows of other domains (the rows a foreign key points at): make those rows through the other domains' services. Lines across domains and the whole app go in `test/`, and so do tests of `src/lib/` (lib may import only zod and lib, so vitest cannot sit next to it). Use the real local D1. HTTP via `request(user, method, path, body)`. To act as the system (cron, a check that the system may not do something), use `systemActor` from `hono-kit/testing` |
| Adding cron / queue | Write the job in `src/jobs/<name>.ts` and pass it to `createWorker({ makeDeps, fetch, scheduled, queue })`. Jobs receive `{ deps, actor, now }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Migrations          | `pnpm db:generate`. Do not run prettier on `migrations/meta`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Do not

- Edit `node_modules/hono-kit`. If something is missing, tell the user
- Copy libs or helpers into the project. Never write `new Hono()` directly (use `createRouter()`)
- Scatter failure codes as strings (take them from a domain `Failure` or a hono-kit standard)
- Name types after TS built-ins (`Record`, `Map`, `Set`, `Error`). For a domain named `records`, call the thing `Entry` or similar (`Record<K, V>` would be shadowed)
- Change the shape for looks. Keep the shapes above and rewrite the contents
