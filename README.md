# hono-kit

Conventions for where things go and what they look like when you write a backend with Hono — with a scaffolder and lint rules.
The goal: whoever writes the code, including AI, it comes out in the same shape.

> Unofficial. Not affiliated with the Hono team.

## Why

When AI writes a backend, the details drift every time: where files go, how failures are returned, how access is checked.
hono-kit fixes the shape up front and stops deviations with types and lint. Every lint message says how to fix it, so the AI can notice and correct itself.

It is not a framework or a platform. It sits thinly on top of plain Hono, and its only dependency is `hono`.

## Getting started

```sh
pnpm create hnk my-app
cd my-app && pnpm install
pnpm hnk g domain posts
pnpm db:generate && pnpm check
```

## The shape

An app has two axes, because the nouns in a URL and the nouns of the domain are different things.

- **Resources** (`src/routes/<noun>/`): what a client points at, cut by the URL. `/customers/:customerId/invoices` lives in `src/routes/customers/invoices/`.
- **Domains** (`src/domains/<name>/`): who keeps which rules, cut by the domain. Each file in a domain is named by its role: model (the thing and its rules), service (the steps), and adapters that connect to the outside (repo, gateway, mailer, queue).
- **Jobs** (`src/jobs/<name>.ts`): entry points that are not HTTP (cron, a queue). Like resources, they live outside domains.

Entry points (routes and jobs) use domains, never the other way. A route may use as many domains as it needs; domains never call each other.

On top of the two axes run two paths:

```
write (POST, PATCH, DELETE): route → service → model → repo    keeps the rules
read (GET):                  route → queries → …Within          keeps the reach
```

What a GET returns is the resource's business, so the read lives next to the resource (`_queries.ts`). It gets a SELECT-only db and reads tables only through their owner's window (`invoicesWithin(db, actor)`), so the reach cannot be left out. When it returns the select as is, the row type (`InvoiceRow`) is inferred from the select; a shape put together in JS (a summary merged from several selects, like `MonthlySummary`) is written by hand. Reads before a write (an entry check, materials for a rule) go through services; the read after a write, to show the result, goes through queries, so a POST or PATCH returns what its GET returns. A write service does not return the thing for showing, only what the caller needs to act next (the ID for a create, otherwise `void`); showing is the job of queries.

`pnpm hnk g domain posts` starts a domain, bare: a thing with only an id and timestamps, wired into `src/deps.ts`. It does not write a resource; you write that where the URL says.

```
src/domains/posts/          (generated)
├─ model.ts     types and rules. Knows nothing outside
├─ service.ts    steps, and the shape of the adapters they need
└─ repo.d1.ts    adapter: table and D1 implementation. Fulfills the shape service declares
src/routes/posts/           (written by hand)
├─ index.ts      entry point: the endpoints (export const GET = createEndpoint(...)). Decides who is acting and calls services
├─ _response.ts  how a post is shown over HTTP
└─ _queries.ts   the reads of the GET endpoints
```

```
  src/routes ──→ model ←────── repo.d1
       │           ↑               │
       └──(deps)─→ service ←───────┘
```

One rule: **every arrow points to model and service.** model knows nothing outside. Adapters fulfill the shape service declares, borrowing only its type. Entry points may use model, but receive services from deps instead of importing them. More files are added only when a second one appears (a second entry point, a second adapter, ...).

## What the code looks like

```ts
// src/routes/posts/[id]/index.ts (/posts/:id)
export const PUT = createEndpoint(
  {
    middleware: [requireAuth],
    request: { param: postParamsSchema, json: postInputSchema },
    responses: {
      200: postResponseSchema,
      ...errorResponses(NotFound),
    },
  },
  async (c, reply, { posts, postsQueries }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const now = c.get("now");

    const result = await posts.update(actor, id, input, now);
    if (!result.ok) return reply.failure(result.error);

    // After a write, read it again the way its GET does
    const post = await postsQueries.get(actor, id);
    if (post === null)
      throw new Error(`post ${id} is gone right after the write`);

    return reply(200, postResponse(post));
  },
);
```

- The method is the export name and the path is where the file sits, so neither is written. `pnpm hnk gen` registers every endpoint in `src/routes.gen.ts` and writes the type for `hc` there.
- `responses` is the contract. If the handler returns something else, the wrong value gets the red squiggle.
- The 401 from `requireAuth` and the 400 from input validation are declared for you. You only write domain failures.
- Who is acting (`actor`) and when (`now`) are decided at the entry point and passed down as arguments.
- When a request touches several domains, the handler reads from as many services as it needs and writes through one call to one service ([cross-domain.md](packages/hono-kit/docs/cross-domain.md)).

```ts
// src/domains/posts/service.ts
async update(actor: Actor, id: PostId, input: PostInput, now: Date): Promise<Result<void, typeof NotFound.code>> {
  const changes = { title: input.title, body: input.body, updatedAt: now };
  const updated = await repo.update(reachOf(actor), id, changes);
  if (updated === null) return err(NotFound.code);

  return ok(undefined);
}
```

- Expected failures are returned as `Result`. The service does not know about HTTP status codes.
- A write does not return the thing for showing, only what the caller needs to act next: the ID for a create, otherwise `void`. Showing is the job of queries.
- Access is part of the query (the reach goes into the WHERE). Things you cannot see are `NOT_FOUND`; their existence is not revealed.
- The service does not read the clock. It receives `now`.

## Lint rules

Shipped as an [oxlint](https://oxc.rs) plugin (`hono-kit/lint`).

| Rule                          | Stops                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `layer-imports`               | Imports that break the direction of the arrows, per file role                  |
| `route-declares-auth`         | Endpoints that do not declare who may call them                                |
| `route-replies-through-reply` | `c.json` that bypasses the `responses` contract                                |
| `route-lists-are-paged`       | List endpoints without a page limit                                            |
| `no-clock-outside-app-entry`  | `new Date()` / `Date.now()` outside where the app is built                     |
| `no-foreign-table-reads`      | Reading another domain's table directly                                        |
| `no-id-cast`                  | Branding IDs with `as`                                                         |
| `no-module-scope-state`       | Mutable state at module scope                                                  |
| `route-responds-200`          | Success statuses other than 200 (201, 204)                                     |
| `route-writes-once`           | An HTTP handler writing through two service calls (reads are `get…` / `list…`) |
| `no-new-hono`                 | `new Hono()` instead of `createRouter()`                                       |

### Who may import what

Each file in a domain is classified by its name prefix (its role); each file in `src/routes/` is a `resource` (`index.ts`), a `response` (`_response.ts`), `queries` (`_queries.ts`, the reads of the GET endpoints) or `errors` (`_errors.ts`, failures only that entry point has). `layer-imports` allows only the imports below; everything else is an error.

<!-- layers:start (generated from packages/hono-kit/lint/layers.mjs; do not edit by hand) -->

| Role     | May import                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model    | zod, hono-kit/system (types only), hono-kit/failures (types only), another domain's model (types only), lib                                                                                                                                                                                                       |
| service  | hono-kit/result, hono-kit/failures, hono-kit/page (types only), hono-kit/system (types only), model, another domain's model (types only), lib                                                                                                                                                                     |
| repo     | drizzle-orm, hono-kit/page, db (types only), hono-kit/sqlite, model, service (types only), another domain's repo, another domain's model, lib. From another domain's repo, only foreign-key tables (…Table) and scoped reads (…Within); from another domain's model, only SQL constants and types                 |
| gateway  | hono-kit/result, model (types only), service (types only), lib                                                                                                                                                                                                                                                    |
| mailer   | hono-kit/result, model (types only), service (types only), lib                                                                                                                                                                                                                                                    |
| queue    | model (types only), service (types only), lib. Puts jobs on a queue. What takes them off is a job in src/jobs/                                                                                                                                                                                                    |
| resource | hono-kit, zod, errors, middleware, another domain's model, resource, response, queries (types only), lib. `src/routes/<noun>/index.ts`, outside domains: `export const GET = createEndpoint(...)`, one per method. Services come from deps (the handler's third argument), never imported                         |
| response | hono-kit, zod, another domain's model, response, queries (types only), lib. `src/routes/<noun>/_response.ts`: how a thing is shown over HTTP                                                                                                                                                                      |
| queries  | drizzle-orm, hono-kit/page, db (types only), another domain's repo, another domain's model, lib. `src/routes/<noun>/_queries.ts`: the reads of the GET endpoints, wired into deps by `hnk gen`. Tables only through …Within (no-foreign-table-reads); from another domain's model, rules to borrow (todayOf, ...) |
| job      | hono-kit (types only), another domain's model, lib. `src/jobs/<name>.ts`, outside domains: runs on a schedule (cron) or a queue message. createWorker passes deps, actor and now. It may join several domains' services from deps                                                                                 |
| errors   | hono-kit, lib. `src/routes/<noun>/_errors.ts`: failures only that entry point has (webhook signatures, ...). Failures of the thing go in model.ts as a Failure. Ones that mean the same in every domain (401, 403, 404) are hono-kit standards (NotFound, ...)                                                    |
| lib      | zod, lib. Code that knows nothing of this app's business, so it could move to another app as is (dates, times, time zones). Anything that names a thing of this app (a role, a status) belongs to its domain instead                                                                                              |

<!-- layers:end -->

## `pnpm check`

Runs typecheck, lint, format check and tests in one go, and lists all failures at the end. With AI, "make `pnpm check` pass" is the one instruction you need.

The generated app also includes `AGENTS.md` (and a `CLAUDE.md` that points to it): only the commands and "read `node_modules/hono-kit/docs/index.md` before writing". The rules themselves ship inside the package (`node_modules/hono-kit/docs/`), so they change with the installed version; a copy made at `hnk init` would stay old when hono-kit is upgraded.

## Scope

- Cloudflare Workers + D1 + Drizzle for now.
- Any Standard Schema library works for validation (tested with zod and valibot).
- 0.x. The shape will change as it gets used in real products.

## More

- All conventions and the reasons behind them: [README.ja.md](README.ja.md) (Japanese)
- Example app: [examples/invoices](examples/invoices) — invoices with payments across domains, cron, queue, webhook, organizations and sharing

## License

MIT
