# cron, queues, mail, and replacing things in tests

## cron

- A job is a function that receives `{ deps, now }`. Put it where you like, for example `src/jobs/<name>.ts`
- `src/main.ts`: `createWorker({ makeDeps, fetch: buildApp().fetch, scheduled: sendUnreadDigests })`
- Off Workers (a timer in a Node server, a script run by an outside cron): call `runScheduled(sendUnreadDigests, { deps: makeDeps(env), now })` from `hono-kit`, with `now` the time the job was due, as `createWorker` does
- `wrangler.jsonc`: add `"triggers": { "crons": ["0 * * * *"] }`
- On Workers, `scheduled` also gets what Workers passes: `{ deps, now, controller, env, ctx }`. With several crons, tell them apart by `controller.cron`, as on plain Workers, and call each job with `{ deps, now }`: `scheduled: async ({ deps, now, controller }) => { if (controller.cron === "0 8 * * *") return sendUnreadDigests({ deps, now }); ... }`
- Tests: call the job directly with `{ deps, now }` instead of going through `scheduled`

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
