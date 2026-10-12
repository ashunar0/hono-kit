import { createMiddleware } from "hono/factory";

import type { RegisteredDeps, RegisteredEnv } from "./register.js";
import type { Result } from "./result.js";
import { systemActor } from "./system-value.js";
import type { System } from "./system.js";

/**
 * What an entry point receives. Who is acting (actor) and when it happened (now) are received, not decided, here.
 * What an HTTP handler gets from c.get("actor") and new Date() is passed in by createWorker
 */
export type CronContext = {
  deps: RegisteredDeps;
  /** An entry point with no user, so always the system */
  actor: System;
  /** The scheduled time (not when it actually ran) */
  now: Date;
};

export type QueueContext<Body> = CronContext & {
  body: Body;
};

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

/**
 * Declares an entry point that verifies the caller another way (a signed webhook, ...).
 * Like allowAnonymous, put it first in the route's middleware; the handler reads `c.get("actor")` (the same name as with requireAuth).
 * Verifying the signature is the handler's job: do not use actor before verifying
 */
export const allowSystem = createMiddleware<{ Variables: { actor: System } }>(
  async (c, next) => {
    c.set("actor", systemActor);
    await next();
  },
);
