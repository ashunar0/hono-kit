import { createMiddleware } from "hono/factory";

import { defineAuth } from "./endpoint.js";
import type { RegisteredDeps } from "./register.js";
import { systemActor } from "./system-value.js";
import type { System } from "./system.js";

/**
 * What an entry point receives. Who is acting (actor) and when it happened (now) are received, not decided, here.
 * What an HTTP handler gets from c.get("actor") and c.get("now") is passed in by the entry point that runs it
 * (createWorker from "hono-kit/worker" on Cloudflare Workers)
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

/**
 * Runs a scheduled job as the system, whatever calls it: createWorker on Workers, a timer or a script elsewhere.
 * The caller gives the deps and `now` (the time the job was due, not when it ran); the actor is handed here
 */
export const runScheduled = (
  job: (context: CronContext) => Promise<void>,
  options: { deps: RegisteredDeps; now: Date },
): Promise<void> => job({ ...options, actor: systemActor });

/**
 * Declares an entry point that verifies the caller another way (a signed webhook, ...).
 * Like allowAnonymous, put it in the endpoint's auth (`auth: allowSystem`); the handler reads `c.get("actor")` (the same name as with requireAuth).
 * Verifying the signature is the handler's job: do not use actor before verifying
 */
export const allowSystem = defineAuth(
  createMiddleware<{ Variables: { actor: System } }>(async (c, next) => {
    c.set("actor", systemActor);
    await next();
  }),
);
