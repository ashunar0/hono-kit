import type { RegisteredDeps, RegisteredEnv } from "./register.js";
import type { Result } from "./result.js";
import type { CronContext, QueueContext } from "./entry.js";

type Bindings = RegisteredEnv["Bindings"];

/** What Workers gives every event, passed on as it is: hono-kit adds deps and now, and takes nothing away */
type FromWorkers = { env: Bindings; ctx: ExecutionContext };

/**
 * A scheduled event on Workers: { deps, now } plus the controller, env and ctx.
 * With several crons, tell them apart by `controller.cron`, as on plain Workers.
 * A job that reads only deps and now can still take CronContext, so tests call it with { deps, now }
 */
export type WorkerCronContext = CronContext &
  FromWorkers & { controller: ScheduledController };

/** A queue message on Workers: { deps, now, body } plus the message itself (attempts, id), env and ctx */
export type WorkerQueueContext<Body> = QueueContext<Body> &
  FromWorkers & { message: Message<Body> };

/** The deps of a worker given no makeDeps. A job that reads one is told what is missing, instead of getting undefined */
const missingDeps = () =>
  new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        throw new Error(
          `deps.${key} is not there: createWorker has no makeDeps. Pass createWorker({ makeDeps, ... })`,
        );
      },
    },
  ) as RegisteredDeps;

/**
 * The Workers entry point. HTTP goes to fetch, schedules to scheduled, queues to queue.
 *
 * - deps are built once per call with makeDeps (provideDeps does the same for HTTP). Without makeDeps, jobs get no deps
 * - What Workers passes (controller or message, env, ctx) reaches the job too
 * - now comes from the event: the scheduled time for scheduled, the enqueue time for queue
 *   (so a retry that crosses midnight is still treated as the same date)
 * - A queue handler returns a Result: ok acks, err retries. An unexpected throw
 *   retries only that message, and the rest of the batch continues
 */
export const createWorker = <Body = never>(options: {
  makeDeps?: (env: Bindings) => RegisteredDeps;
  fetch: (
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ) => Response | Promise<Response>;
  scheduled?: (context: WorkerCronContext) => Promise<void>;
  queue?: (
    context: WorkerQueueContext<Body>,
  ) => Promise<Result<unknown, string>>;
}): ExportedHandler<Bindings, Body> => {
  const { makeDeps, fetch, scheduled, queue } = options;
  const depsOf = (env: Bindings) => makeDeps?.(env) ?? missingDeps();

  return {
    fetch,
    ...(scheduled && {
      async scheduled(controller, env, ctx) {
        await scheduled({
          deps: depsOf(env),
          now: new Date(controller.scheduledTime),
          controller,
          env,
          ctx,
        });
      },
    }),
    ...(queue && {
      async queue(batch, env, ctx) {
        const deps = depsOf(env);

        for (const message of batch.messages) {
          try {
            const result = await queue({
              deps,
              now: message.timestamp,
              body: message.body,
              message,
              env,
              ctx,
            });
            if (result.ok) message.ack();
            else message.retry();
          } catch (error) {
            console.error("[queue] unhandled", error);
            message.retry();
          }
        }
      },
    }),
  };
};
