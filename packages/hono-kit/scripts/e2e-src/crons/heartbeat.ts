import { createCron } from "hono-kit";

/** Written to by the e2e tests; a real cron writes to the database through deps */
export const beats: string[] = [];

export const cron = createCron({ schedule: "0 8 * * *" }, async ({ deps, now }) => {
  if (deps.db === undefined) throw new Error("no deps");
  beats.push(now.toISOString());
});
