# cron, queues, mail, and replacing things in tests

## cron

- Location: `src/jobs/<name>.ts`, outside domains. It may import only **types** from hono-kit and any domain's model (values too, to brand IDs). It receives `{ deps, actor, now }` and takes services from `deps`
- `src/index.ts`: `createWorker({ makeDeps, fetch: app.fetch, scheduled: sendUnreadDigests })`
- Off Workers (a timer in a Node server, a script run by an outside cron): call `runScheduled(sendUnreadDigests, { deps: makeDeps(env), now })` from `hono-kit`, with `now` the time the job was due. It hands the job the system actor, as `createWorker` does
- `wrangler.jsonc`: add `"triggers": { "crons": ["0 * * * *"] }`
- Tests: call the job in `src/jobs/` directly instead of going through `scheduled`. Act as `systemActor` from `hono-kit/testing`
- A batch over every user may not fit the `Page` cursor (`at: Date`, `id`); a `GROUP BY` aggregate has no `at`. In that case, put a dedicated read in the repo (`unreadSummaries(after, limit)`) and loop yourself. Never make it an unbounded read
- Add "already sent" markers to suppress resends when they are needed, not up front

## queue

- Taking messages off: a job in `src/jobs/<name>.ts`, passed as `createWorker({ queue })`. It receives `{ deps, actor, now, body }`; `now` is when the message was put on the queue. Return a `Result`: ok acks, err retries
- Putting messages on: the domain's `queue.<tech>.ts` (`queue.cloudflare.ts`) fulfills the shape service declares (`enqueue(jobs)`). `deps.ts` wires it

## mailer / gateway

- File name: `mailer.<tech>.ts` (`mailer.dummy.ts` before the provider is decided). It may import only `hono-kit/result`, model types and service types
- service declares the shape it sends (`send(to, subject, body): Promise<Result<void, "MAIL_FAILED">>`) and takes it as a port (`{ repo, mailer }`), and `deps.ts` wires it. A mailer or a queue only writes, so it has no `read` side and is not passed to the service's `read`. A gateway that also reads (verifying a webhook signature, fetching a status) is split like a repository: `{ read: { verifyEvent }, write: { createCheckout } }` The failure is a `Failure` with `kind: "upstream"` (502)
- A side effect outside goes "record first → call outside → settle with the result", so what happened can be traced afterwards. When the outside takes an idempotency key, pass one (the payment ID to Stripe, a key with the date for a reminder mail). Whether a failure midway may send twice or may miss one is a business decision: write it in a comment in service
- When a dummy "collects what was sent", **it cannot keep an array at module scope** (`no-module-scope-state`). Take the outbox as an argument, like `dummy(outbox: Mail[])`

## Failures only an entry point has

A failure that belongs to the entry point, not to a thing (a webhook signature that does not match), goes next to that entry point in `src/routes/<noun>/_errors.ts` as `httpError(code, status, message)`. A domain has no `errors.ts`.

## Replacing external services in tests

`buildApp` takes `makeDeps` as an argument. For domains you want to replace, make it `makeDeps(env, overrides?)`: production passes nothing (a dummy or the real thing), tests pass a stand-in. Do not use `vi.mock` (lint stops it).

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
