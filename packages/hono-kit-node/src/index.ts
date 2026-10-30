/**
 * The Node side of hono-kit/worker: runs the crons hnk prepare lists (src/crons) on timers, in the server process.
 * Kept apart from hono-kit because it needs a cron library (croner), as Hono keeps @hono/node-server apart from hono
 */
import { Cron as Timer } from "croner";
import type { Cron, CronContext } from "hono-kit";

/**
 * Starts a timer per cron and returns a function that stops them all (call it on shutdown).
 *
 * - The schedules are read in UTC, as Workers reads wrangler.jsonc, so one schedule means the same time on both
 * - now is the time the run was due, not when it ran, as on Workers
 * - A run still going when the next is due makes the next one skip (protect), so two runs never overlap
 * - A failure is logged and the timer goes on: a throw from a timer would otherwise end the process
 */
export const startCrons = (
  crons: readonly (Cron & { name: string })[],
  options: { makeDeps: () => CronContext["deps"] },
): (() => void) => {
  const timers = crons.map(
    (cron) =>
      new Timer(
        cron.schedule,
        {
          name: cron.name,
          timezone: "UTC",
          protect: true,
          catch: (error) => console.error(`[cron] ${cron.name} failed`, error),
        },
        async (self) => {
          await cron.run({ deps: options.makeDeps(), now: self.currentRun() ?? new Date() });
        },
      ),
  );
  return () => {
    for (const timer of timers) timer.stop();
  };
};
