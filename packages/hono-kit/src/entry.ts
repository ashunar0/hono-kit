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

/** A scheduled job declared in src/crons: when it runs, and what it does. hnk prepare lists them in routes.gen.ts */
export type Cron = {
  /** A cron expression ("0 8 * * *", every day at 8:00 UTC). A string literal, so hnk prepare can compare it with wrangler.jsonc */
  schedule: string;
  run: (context: CronContext) => Promise<void>;
};

/**
 * `export const cron = createCron({ schedule: "0 8 * * *" }, async ({ deps, now }) => { ... })` in src/crons/<name>.ts.
 * It only declares: createWorker({ crons }) runs it on Workers, startCrons(crons) from hono-kit-node on Node.
 * Tests call `cron.run({ deps, now })`
 */
export const createCron = (
  declaration: { schedule: string },
  run: (context: CronContext) => Promise<void>,
): Cron => ({ schedule: declaration.schedule, run });
