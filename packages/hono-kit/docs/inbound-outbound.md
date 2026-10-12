# cron, mail, and replacing things in tests

## cron

- Location: the module's `cron.ts`. It may import only **types** from hono-kit and domain. It receives `{ deps, now }`
- `api/index.ts`: `createWorker({ makeDeps, fetch: app.fetch, scheduled: sendUnreadDigests })`
- `wrangler.jsonc`: add `"triggers": { "crons": ["0 * * * *"] }`
- Tests: call the function in `cron.ts` directly instead of going through `scheduled`. Act as `systemActor` from `hono-kit/testing`
- A batch over every user may not fit the `Page` cursor (`at: Date`, `id`); a `GROUP BY` aggregate has no `at`. In that case, put a dedicated read in the repo (`unreadSummaries(after, limit)`) and loop yourself. Never make it an unbounded read
- Add "already sent" markers to suppress resends when they are needed, not up front

## mailer / gateway

- File name: `mailer.<tech>.ts` (`mailer.dummy.ts` before the provider is decided). It may import only `hono-kit/result`, domain types and service types
- service declares the shape it sends (`send(to, subject, body): Promise<Result<void, "MAIL_FAILED">>`), and `deps.ts` wires it. The failure is a `Failure` with `kind: "upstream"` (502)
- When a dummy "collects what was sent", **it cannot keep an array at module scope** (`no-module-scope-state`). Take the outbox as an argument, like `dummy(outbox: Mail[])`

## Replacing external services in tests

`buildApp` takes `makeDeps` as an argument. For modules you want to replace, make it `makeDeps(env, overrides?)`: production passes nothing (a dummy or the real thing), tests pass a stand-in. Do not use `vi.mock` (lint stops it).

```ts
export const makeDeps = (
  env: AppEnv["Bindings"],
  overrides: { invitationMailer?: Mailer } = {},
) => {
  /* ... */
};

// test
const outbox: Mail[] = [];
const app = buildApp((env) =>
  makeDeps(env, { invitationMailer: dummy(outbox) }),
);
```

## Making IDs in tests

`import { randomUUID } from "node:crypto"` fails typecheck. Use the global `crypto.randomUUID()`.
