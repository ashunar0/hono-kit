# AGENTS.md

This is a backend built on [hono-kit](https://github.com/ashunar0/hono-kit): Hono + Cloudflare Workers + D1 + Drizzle + Standard Schema (zod).
hono-kit fixes where things go and what they look like. **The generator produces the shape; do not invent layers.** When unsure, read an existing module to the end and write the same way.

## Commands

```sh
pnpm hnk g module <plural camelCase>   # add a resource, e.g. invoices, signupRequests
pnpm db:generate                       # after changing a table; writes migrations/ (tests read them)
pnpm exec prettier --write .           # once after editing, before check
pnpm check                             # typecheck, lint, format check, tests
```

**Do not stop until `pnpm check` prints `All checks passed`.** Every lint message says how to fix it. Do not silence lint (the only exception is `route-lists-are-paged`, with a reason).

## Adding a resource

`pnpm hnk g module <name>` writes `domain / service / repo.d1 / routes / routes.test` under `api/modules/<name>/` and wires it into `api/deps.ts` and `api/index.ts` above the `// hnk:` lines.
The output is a CRUD for something with just `title` and `body`. **Rewrite it into the real thing:**

1. `domain.ts`: types, `…InputSchema` (zod; `trim()` before checking length), `reachOf`, failures (`Failure`)
2. `repo.d1.ts`: columns, `to…` (row → thing), `within` (reach → WHERE)
3. `service.ts`: the steps. Declare the `…Repository` shape here
4. `routes.ts`: input/output schemas, `…Response` (thing → response), `responses`
5. `routes.test.ts`: create, read, list, 400 on bad input, 404 for someone else, 404 for another org, 401 when signed out

## The shape (four files in every module)

| File         | Side     | Role                                                | May import                                                              |
| ------------ | -------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `domain.ts`  | core     | The thing (What): types, rules, ID brands, failures | zod, `hono-kit/failures` (types), `hono-kit/system` (types)             |
| `service.ts` | core     | The steps (How) and the storage shape they need     | `hono-kit/result`, `hono-kit/failures`, `hono-kit/page` (types), domain |
| `routes.ts`  | inbound  | HTTP input/output, thing → response                 | `hono-kit`, zod, middleware, domain                                     |
| `repo.d1.ts` | outbound | Table, D1 implementation, row → thing               | drizzle-orm, `hono-kit/page`, domain, service (types)                   |

Every arrow points to domain. routes never imports service; the handler receives it from deps as its third argument (`{ invoices }`). `hnk/layer-imports` enforces this.

Grow only **when a second one appears**: cron / queue / webhook (`cron.ts` and so on, next to routes), another store or external API (`gateway.stripe.ts`, `mailer.resend.ts`), a write entry point for other modules (`commands/<operation>.ts`). **Do not add them up front.**

## Rules

- **service**: arguments go "as whom (`actor`) → what → how → when (`now`)". Never call `new Date()` (only routes read the clock). Never import hono. Knows no HTTP status
- **actor**: over HTTP, `requireAuth` sets `c.get("actor")`. Routes that need no auth use `allowAnonymous`. Only guards read `user`
- **Failures**: expected ones (not found, no permission, an external service not answering) are returned as `Result` (`err(NotFound.code)`). Unexpected ones (the DB is down) are thrown
  - 401, 403, 404 are hono-kit standards (`Unauthorized` / `Forbidden` / `NotFound`, imported from `hono-kit`)
  - A failure of this thing goes in **domain.ts** as `{ code, kind, message } as const`. `kind` is `unauthenticated / forbidden / notFound / conflict / upstream` (hono-kit decides the status). service returns `err(NotDraft.code)`
  - Declare `...errorResponses(NotFound, NotDraft)` in the route's `responses`; the handler returns `reply.failure(result.error)`
  - What you cannot see is `NOT_FOUND` (its existence is not revealed); what you can see but may not touch is `FORBIDDEN`
  - Entry-point-only failures (a webhook signature, ...) go in the module's `errors.ts` as `httpError(code, status, message)`
- **Returning**: `reply(200, body)` and `reply.failure(...)`. Never `c.json` (lint stops it). Create returns the created thing with 200. Delete returns `{ ok: true }` with 200
- **IDs**: only the domain's `…Id` function applies the brand with `as`. Inputs use `…IdSchema`. Never write `as …Id` elsewhere (`no-id-cast`)
- **Input**: only values that passed a schema with zod's `.brand<"…Input">()` reach service
- **Lists**: `pageQuerySchema(filters)` / `pageResponseSchema(item)` / `pageResponse(page, map)`. The repo takes a `PageQuery`, reads `limit + 1` rows and returns `toPage(...)`. Never write an unbounded list
  - Filters: service declares `type …ListQuery = PageQuery & { status?: …Status }`, and the repo's `listWithin(reach, query)` takes it. routes accepts `pageQuerySchema(z.object({ status: …StatusSchema.optional() }))` and passes it straight through
- **Reach**: put "someone else's" into the WHERE and do it in one statement (`updateWithin` / `deleteWithin` / `findWithin`). Never check first and write in a second statement
- **Enums**: domain holds an `as const` array (`…Statuses`) and a zod enum (`…StatusSchema`); the repo's `text("status", { enum: …Statuses })` and the routes schema use the same ones. `row.status` comes back typed, so no parsing
- **Check order**: input validation 400 (schema) → NOT_FOUND → FORBIDDEN → conflict. Broken input is a 400 before any state is looked at
- **Dates without time**: a text column holding `YYYY-MM-DD`, with the schema in domain (shape regex → a real calendar day). Check `getTime()` of `new Date(s)` for `NaN` **first** (`toISOString()` throws RangeError on invalid dates, which becomes a 500 inside a zod refine). Date math like `from + 7 days` is a pure function in domain (never read the current time there)
- **Optional input**: `undefined` in input, `null` in the DB. Normalize with `?? null` in service. PUT replaces everything, so omitted optional fields are overwritten with null
- **Aggregates**: put them in the module that owns the table being counted, with that module's reach. A GET that returns an array hits `route-lists-are-paged`; when the size is bounded elsewhere, put `// oxlint-disable-next-line hnk/route-lists-are-paged -- reason` **right above** the `path:` line (it does not work above `.endpoint(`). Fixed paths like `/weekly` go before `/:id`
- **Unique constraints**: let the table's `uniqueIndex` decide (reading first and then writing can be interleaved). Wrap the repo's `insert` / `updateWithin` in `try/catch`; if `isUniqueViolation(error)` from `api/db/errors` is true, return a failure value (rethrow otherwise), and service turns it into the domain's conflict `Failure`. Do not write your own check. When a repo returns both "absent" and "duplicate", return a union with a string literal that cannot be confused with the thing (`Subject | "nameTaken" | null`). Test DBs are shared between calls, so use fresh unique values (`crypto.randomUUID()`)
- **Times on things**: `createdAt` / `updatedAt` also come from `now`

## Things whose state moves (draft → sent, ...)

- A transition that is not allowed is a domain failure `{ code: "…_NOT_STARTABLE", kind: "conflict", message }`. The code is `<THING>_` + what happened
- Transitions are `POST /:id/<verb>` on the same module's router. The repo may add `transitionWithin(id, reach, from, changes)`: one statement with `WHERE id AND status = from AND within(reach)`; if it returns null, another request moved first, so return the same conflict
- service does `findWithin` (NOT_FOUND if absent) → a check (a pure domain function such as `canStart(x)`) → `transitionWithin`

## Read before you…

- **use another module**: `node_modules/hono-kit/docs/cross-module.md` (declare → wire in deps → references, why values from other modules cannot be imported, `commands/`, parent/child)
- **add cron, queue, webhook, mailer or gateway, or replace them in tests**: `node_modules/hono-kit/docs/inbound-outbound.md`

In short: never import another module's service or repo. The using service declares the shape it needs, and `api/deps.ts` wires it. Another module's ID is a plain `string` on the using side; the brand is applied in the repo or in `deps.ts`. Another module's table is used only inside foreign-key `references()` and through the owner's `…Within(db, actor)`.

## When unsure

| Question               | Rule                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| String input           | Always `trim()` before checking length                                                                                                                               |
| Foreign key `onDelete` | `cascade` if children go away with the parent                                                                                                                        |
| Where tests go         | Inside the module if it stays in one module. Cross-module lines and the whole app go in `test/`. Use the real local D1. HTTP via `request(user, method, path, body)` |
| Route without auth     | `middleware: [allowAnonymous]` (always write it, so it differs from forgetting)                                                                                      |
| Adding cron / queue    | Pass them to `createWorker({ makeDeps, fetch, scheduled, queue })`. Handlers receive `{ deps, actor, now }`                                                          |
| Migrations             | `pnpm db:generate`. Do not run prettier on `migrations/meta`                                                                                                         |

## Do not

- Edit `node_modules/hono-kit`. If something is missing, tell the user
- Copy libs or helpers into the project. Never write `new Hono()` directly (use `createRouter()`)
- Add layers or ports ahead of time. Wait until the trigger happens
- Scatter failure codes as strings (take them from a domain `Failure` or a hono-kit standard)
- Name types after TS built-ins (`Record`, `Map`, `Set`, `Error`). For a module named `records`, call the thing `Entry` or similar (`Record<K, V>` would be shadowed)
- Change the shape for looks. Keep the generator's shape and rewrite the contents
