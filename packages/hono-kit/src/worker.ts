import type { RegisteredDeps, RegisteredEnv } from "./register.js";
import type { Result } from "./result.js";
import { systemActor } from "./system-value.js";
import type { CronContext, QueueContext } from "./entry.js";

type Bindings = RegisteredEnv["Bindings"];

/**
 * The Workers entry point. HTTP goes to fetch, schedules to scheduled, queues to queue.
 *
 * - deps are built once per call with makeDeps (provideDeps does the same for HTTP)
 * - There is no user, so this passes the actor (the system) for calling services. Entry files never create it; they only receive it
 * - now comes from the event: the scheduled time for scheduled, the enqueue time for queue
 *   (so a retry that crosses midnight is still treated as the same date)
 * - A queue handler returns a Result: ok acks, err retries. An unexpected throw
 *   retries only that message, and the rest of the batch continues
 */
export const createWorker = <Body = never>(options: {
  makeDeps: (env: Bindings) => RegisteredDeps;
  fetch: (
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ) => Response | Promise<Response>;
  scheduled?: (context: CronContext) => Promise<void>;
  queue?: (context: QueueContext<Body>) => Promise<Result<unknown, string>>;
}): ExportedHandler<Bindings, Body> => {
  const { makeDeps, fetch, scheduled, queue } = options;

  return {
    fetch,
    ...(scheduled && {
      async scheduled(controller, env) {
        await scheduled({
          deps: makeDeps(env),
          actor: systemActor,
          now: new Date(controller.scheduledTime),
        });
      },
    }),
    ...(queue && {
      async queue(batch, env) {
        const deps = makeDeps(env);

        for (const message of batch.messages) {
          try {
            const result = await queue({
              deps,
              actor: systemActor,
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
