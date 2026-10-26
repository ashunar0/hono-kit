import type { RegisteredDeps } from "./register.js";

/**
 * What an entry point that is not HTTP receives. When it happened (now) is received, not decided, here.
 * The entry point that runs it passes it in (createWorker from "hono-kit/worker" on Cloudflare Workers)
 */
export type CronContext = {
  deps: RegisteredDeps;
  /** The scheduled time (not when it actually ran) */
  now: Date;
};

export type QueueContext<Body> = CronContext & {
  body: Body;
};

/**
 * Runs a scheduled job, whatever calls it: createWorker on Workers, a timer or a script elsewhere.
 * The caller gives the deps and `now` (the time the job was due, not when it ran)
 */
export const runScheduled = (
  job: (context: CronContext) => Promise<void>,
  options: { deps: RegisteredDeps; now: Date },
): Promise<void> => job(options);
