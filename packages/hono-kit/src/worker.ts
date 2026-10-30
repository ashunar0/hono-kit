import type { RegisteredDeps, RegisteredEnv } from "./register.js";
import type { Result } from "./result.js";
import type { Cron, CronContext, QueueContext } from "./entry.js";

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

/**
 * A queue message on Workers: { deps, now, body } plus the message itself (attempts, id), its batch, env and ctx.
 * With several queues, tell them apart by `batch.queue`, as on plain Workers
 */
export type WorkerQueueContext<Body> = QueueContext<Body> &
  FromWorkers & { message: Message<Body>; batch: MessageBatch<Body> };

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
 * - crons (the list hnk prepare writes from src/crons) run on the schedule each declares: every cron whose schedule is
 *   `controller.cron` runs, and a failure in one does not stop the others. `scheduled` is for writing it by hand instead
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
  crons?: readonly Cron[];
  scheduled?: (context: WorkerCronContext) => Promise<void>;
  queue?: (
    context: WorkerQueueContext<Body>,
  ) => Promise<Result<unknown, string>>;
}): ExportedHandler<Bindings, Body> => {
  const { makeDeps, fetch, crons, scheduled, queue } = options;
  const depsOf = (env: Bindings) => makeDeps?.(env) ?? missingDeps();

  return {
    fetch,
    ...((crons || scheduled) && {
      async scheduled(controller, env, ctx) {
        const deps = depsOf(env);
        const now = new Date(controller.scheduledTime);
        if (scheduled) await scheduled({ deps, now, controller, env, ctx });
        if (!crons) return;

        const due = crons.filter((cron) => cron.schedule === controller.cron);
        // hnk prepare compares src/crons with wrangler.jsonc, so this is a trigger added by hand (the dashboard)
        if (due.length === 0 && !scheduled)
          throw new Error(`No cron in src/crons has the schedule "${controller.cron}"`);
        const failed = (
          await Promise.allSettled(due.map((cron) => cron.run({ deps, now })))
        ).flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
        if (failed.length > 0)
          throw new AggregateError(failed, `${failed.length} cron(s) failed for "${controller.cron}"`);
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
              batch,
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
