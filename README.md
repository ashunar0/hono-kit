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
pnpm hnk g module posts
pnpm db:generate && pnpm check
```

## The shape

An app has two axes, because the nouns in a URL and the nouns of the domain are different things.

- **Resources** (`api/routes/<noun>/`): what a client points at, cut by the URL. `/customers/:customerId/invoices` lives in `api/routes/customers/invoices/`.
- **Modules** (`api/modules/<name>/`): who keeps which rules, cut by the domain. Each module has three sides, as in hexagonal architecture.

Routes use modules, never the other way. A route may use as many modules as it needs; modules never call each other.

| Side         | What it is                                                     | Files                       |
| ------------ | -------------------------------------------------------------- | --------------------------- |
| **core**     | What the thing is and what it can do. Knows nothing outside.   | domain, service             |
| **inbound**  | Called from outside. Decides who is acting and calls the core. | resources, cron, queue      |
| **outbound** | Goes outside. Fulfills the shapes the core declares.           | repo, gateway, mailer, jobs |

`pnpm hnk g module posts` starts a module, bare: a thing with only an id and timestamps, wired into `api/deps.ts`. It does not write a resource; you write that where the URL says.

```
api/modules/posts/          (generated)
├─ domain.ts     core: types and rules
├─ service.ts    core: steps, and the shape of storage they need
└─ repo.d1.ts    outbound: table and D1 implementation
api/routes/posts/           (written by hand)
├─ index.ts      inbound: the router (HTTP input, handlers)
└─ response.ts   inbound: how a post is shown over HTTP
```

```
  api/routes ──→ domain ←────── repo.d1
       │           ↑               │
       └──(deps)─→ service ←───────┘
```

One rule: **every arrow points to the core.** Handlers receive services from deps instead of importing them. More files are added only when a second one appears (a second entry point, a second storage, ...).

## What the code looks like

```ts
// api/routes/posts/index.ts
export const postsRouter = createRouter().endpoint(
  {
    method: "put",
    path: "/:id",
    middleware: [requireAuth],
    request: { param: postParamsSchema, json: postInputSchema },
    responses: {
      200: postResponseSchema,
      ...errorResponses(NotFound),
    },
  },
  async (c, reply, { posts }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const now = new Date();

    const result = await posts.update(actor, id, input, now);
    if (!result.ok) return reply.failure(result.error);

    return reply(200, postResponse(result.value));
  },
);
```

- `responses` is the contract. If the handler returns something else, the wrong value gets the red squiggle.
- The 401 from `requireAuth` and the 400 from input validation are declared for you. You only write domain failures.
- Who is acting (`actor`) and when (`now`) are decided at the entry point and passed down as arguments.
- When a request touches several modules, the handler reads from as many services as it needs and writes through one call to one service ([cross-module.md](packages/hono-kit/docs/cross-module.md)).

```ts
// api/modules/posts/service.ts
async update(actor: Actor, id: PostId, input: PostInput, now: Date): Promise<Result<Post, typeof NotFound.code>> {
  const changes = { title: input.title, body: input.body, updatedAt: now };
  const updated = await repo.updateWithin(id, reachOf(actor), changes);
  if (updated === null) return err(NotFound.code);

  return ok(updated);
}
```

- Expected failures are returned as `Result`. The service does not know about HTTP status codes.
- Access is part of the query (`Within`). Things you cannot see are `NOT_FOUND`; their existence is not revealed.
- The service does not read the clock. It receives `now`.

## Lint rules

Shipped as an [oxlint](https://oxc.rs) plugin (`hono-kit/lint`).

| Rule                          | Stops                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| `layer-imports`               | Imports that break the direction of the arrows, per file role |
| `route-declares-auth`         | Endpoints that do not declare who may call them               |
| `route-replies-through-reply` | `c.json` that bypasses the `responses` contract               |
| `route-lists-are-paged`       | List endpoints without a page limit                           |
| `no-clock-outside-inbound`    | `new Date()` / `Date.now()` in core and outbound              |
| `no-foreign-table-reads`      | Reading another module's table directly                       |
| `no-id-cast`                  | Branding IDs with `as`                                        |
| `no-module-scope-state`       | Mutable state at module scope                                 |

### Who may import what

Each file in a module is classified by its name prefix (its role); each file in `api/routes/` is a `resource` (`index.ts`) or a `response` (`response.ts`). `layer-imports` allows only the imports below; everything else is an error.

<!-- layers:start (generated from packages/hono-kit/lint/layers.mjs; do not edit by hand) -->

| Side     | Role     | May import                                                                                                                                                                                                                                                                                       |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| core     | domain   | zod, hono-kit/system (types only), hono-kit/failures (types only), another module's domain (types only), shared                                                                                                                                                                                  |
| core     | service  | hono-kit/result, hono-kit/failures, hono-kit/page (types only), hono-kit/system (types only), domain, another module's domain (types only), shared                                                                                                                                               |
| inbound  | errors   | hono-kit, shared. Entry-point-only failures (webhook signatures, ...). Failures of the thing go in domain.ts as a Failure. Ones that mean the same in every module (401, 403, 404) are hono-kit standards (NotFound, ...)                                                                        |
| inbound  | cron     | hono-kit (types only), domain, another module's domain, shared. createWorker passes deps, actor and now. An entry point: it may join several modules' services from deps                                                                                                                         |
| inbound  | queue    | hono-kit (types only), domain, another module's domain, shared. Same as cron                                                                                                                                                                                                                     |
| outbound | repo     | drizzle-orm, hono-kit/page, db (types only), dbErrors, domain, service (types only), another module's repo, another module's domain, shared. From another module's repo, only foreign-key tables (…Table) and scoped reads (…Within); from another module's domain, only SQL constants and types |
| outbound | gateway  | hono-kit/result, domain (types only), service (types only), shared                                                                                                                                                                                                                               |
| outbound | mailer   | hono-kit/result, domain (types only), service (types only), shared                                                                                                                                                                                                                               |
| outbound | jobs     | domain (types only), service (types only), shared                                                                                                                                                                                                                                                |
| inbound  | resource | hono-kit, zod, errors, middleware, another module's domain, another module's errors, resource, response, shared. `api/routes/<noun>/index.ts`, outside modules. Services come from deps (the handler's third argument), never imported                                                           |
| inbound  | response | hono-kit, zod, another module's domain, response, shared. `api/routes/<noun>/response.ts`: how a thing is shown over HTTP                                                                                                                                                                        |
| shared   | shared   | zod, shared. Pure values and calculations that belong to no domain (dates, times, time zones). Anything that names a thing of this app (a role, a status) belongs to its module instead                                                                                                          |

<!-- layers:end -->

## `pnpm check`

Runs typecheck, lint, format check and tests in one go, and lists all failures at the end. With AI, "make `pnpm check` pass" is the one instruction you need.

The generated app also includes `AGENTS.md` (and a `CLAUDE.md` that points to it): the commands, the shape and the rules, kept short. Longer guides that are read only when needed ship inside the package (`node_modules/hono-kit/docs/`).

## Scope

- Cloudflare Workers + D1 + Drizzle for now.
- Any Standard Schema library works for validation (tested with zod and valibot).
- 0.x. The shape will change as it gets used in real products.

## More

- All conventions and the reasons behind them: [README.ja.md](README.ja.md) (Japanese)
- Example app: [examples/invoices](examples/invoices) — invoices with payments across modules, cron, queue, webhook, organizations and sharing

## License

MIT
