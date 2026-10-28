import type { RegisteredDeps, RegisteredEnv } from "./register.js";
import type { Result } from "./result.js";
import { type CronContext, type QueueContext, runScheduled } from "./entry.js";

type Bindings = RegisteredEnv["Bindings"];

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
  scheduled?: (context: CronContext) => Promise<void>;
  queue?: (context: QueueContext<Body>) => Promise<Result<unknown, string>>;
}): ExportedHandler<Bindings, Body> => {
  const { makeDeps, fetch, scheduled, queue } = options;
  const depsOf = (env: Bindings) => makeDeps?.(env) ?? missingDeps();

  return {
    fetch,
    ...(scheduled && {
      async scheduled(controller, env) {
        await runScheduled(scheduled, {
          deps: depsOf(env),
          now: new Date(controller.scheduledTime),
        });
      },
    }),
    ...(queue && {
      async queue(batch, env) {
        const deps = depsOf(env);

        for (const message of batch.messages) {
          try {
            const result = await queue({
              deps,
              now: message.timestamp,
              body: message.body,
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
