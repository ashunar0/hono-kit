# cron, queues, mail, and replacing things in tests

## cron

- One cron is one file, `src/crons/<name>.ts` (the name is its place: `src/crons/billing/monthly.ts` is `billing/monthly`). It exports `cron`:
  ```ts
  import { createCron } from "hono-kit";

  export const cron = createCron({ schedule: "0 8 * * *" }, async ({ deps, now }) => {
    // now is the time the run was due, not when it ran
  });
  ```
- `schedule` is a cron expression in UTC, written as a string literal. Files starting with `_` and tests are not crons
- `hnk prepare` lists them as `crons` in `src/routes.gen.ts`. The templates already run that list:
  - Workers: `createWorker({ makeDeps, fetch: buildApp().fetch, crons })` in `src/main.ts`. Add each schedule to `"triggers": { "crons": [...] }` in `wrangler.jsonc` too: `hnk prepare` stops when the two differ (one edited without the other would quietly never run). It does not edit `wrangler.jsonc`
  - Node: `startCrons(crons, { makeDeps })` from `hono-kit-node` in `src/server.ts`, which returns the function that stops them on shutdown. A run still going when the next is due makes that one skip; a failure is logged and the timer goes on
- Tests: call `cron.run({ deps, now })`
- On Workers, `createWorker({ scheduled })` still takes a hand-written handler with what Workers passes (`{ deps, now, controller, env, ctx }`), and `runScheduled(job, { deps, now })` runs a job from anywhere else (a script run by an outside cron)

## queue

- Taking messages off: a job passed as `createWorker({ queue })`. It receives `{ deps, now, body }`, and on Workers the `message` (`attempts`, `id`), its `batch`, `env` and `ctx` too (with several queues, tell them apart by `batch.queue`); `now` is when the message was put on the queue. Return a `Result`: ok acks, err retries
- Return err only for a failure that may go away when tried again. A failure that will not go away ends with ok, and leaves a record that the message was given up

## mailer / gateway

- A failure of an outside service is a `Failure` with `kind: "upstream"` (502)
- When a dummy "collects what was sent", **it cannot keep an array at module scope** (`no-module-scope-state`). Take the outbox as an argument, like `dummy(outbox: Mail[])`

## Failures only an entry point has

A failure that belongs to the entry point, not to a thing (a webhook signature that does not match), is made with `httpError(code, status, message)`.

## Replacing external services in tests

`buildApp` takes `makeDeps` as an argument. For parts you want to replace, make it `makeDeps(env, overrides?)`: production passes nothing (a dummy or the real thing), tests pass a stand-in.

```ts
export const makeDeps = (
  env: Env,
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
