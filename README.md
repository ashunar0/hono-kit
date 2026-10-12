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

An app is split into modules by noun (`invoices`, `posts`, ...). Each module has three sides, as in hexagonal architecture.

| Side         | What it is                                                     | Files                        |
| ------------ | -------------------------------------------------------------- | ---------------------------- |
| **core**     | What the thing is and what it can do. Knows nothing outside.  | domain, service, commands    |
| **inbound**  | Called from outside. Decides who is acting and calls the core. | routes, webhook, cron, queue |
| **outbound** | Goes outside. Fulfills the shapes the core declares.          | repo, gateway, mailer, jobs  |

Every module starts with four files:

```
api/modules/posts/
├─ domain.ts    core: types and rules
├─ service.ts   core: steps, and the shape of storage they need
├─ routes.ts    inbound: HTTP input/output
└─ repo.d1.ts   outbound: table and D1 implementation
```

```
  routes ──────→ domain ←────── repo.d1
                   ↑               │
                service ←──────────┘
```

One rule: **every arrow points to the core.** More files are added only when a second one appears (a second entry point, a second storage, ...).

## What the code looks like

```ts
// api/modules/posts/routes.ts
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

| Rule                           | Stops                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| `layer-imports`                | Imports that break the direction of the arrows, per file role       |
| `route-declares-auth`          | Endpoints that do not declare who may call them                     |
| `route-replies-through-reply`  | `c.json` that bypasses the `responses` contract                     |
| `route-lists-are-paged`        | List endpoints without a page limit                                 |
| `no-clock-outside-inbound`     | `new Date()` / `Date.now()` in core and outbound                    |
| `no-foreign-table-reads`       | Reading another module's table directly                             |
| `no-id-cast`                   | Branding IDs with `as`                                              |
| `no-module-scope-state`        | Mutable state at module scope                                       |

## `pnpm check`

Runs typecheck, lint, format check and tests in one go, and lists all failures at the end. With AI, "make `pnpm check` pass" is the one instruction you need.

## Scope

- Cloudflare Workers + D1 + Drizzle for now.
- Any Standard Schema library works for validation (tested with zod and valibot).
- 0.x. The shape will change as it gets used in real products.

## More

- All conventions and the reasons behind them: [README.ja.md](README.ja.md) (Japanese)
- Example app: [examples/invoices](examples/invoices) — invoices with cross-module writes, cron, queue, webhook, organizations and sharing

## License

MIT
