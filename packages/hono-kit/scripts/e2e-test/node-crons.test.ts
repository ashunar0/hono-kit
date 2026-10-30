import { createCron } from "hono-kit";
import { startCrons } from "hono-kit-node";
import { expect, it } from "vitest";
import { makeDeps } from "#/main";

it("startCrons runs a cron on its schedule with now the due time, and stops", async () => {
  const runs: Date[] = [];
  // Every second (croner reads a sixth field as seconds), so the test does not wait a minute
  const everySecond = createCron({ schedule: "* * * * * *" }, async ({ deps, now }) => {
    expect(deps.db).toBeDefined();
    runs.push(now);
  });
  const stop = startCrons([{ name: "every-second", ...everySecond }], { makeDeps });

  await new Promise((resolve) => setTimeout(resolve, 2100));
  stop();
  const ran = runs.length;
  await new Promise((resolve) => setTimeout(resolve, 1100));

  expect(ran).toBeGreaterThanOrEqual(2);
  expect(runs.every((now) => now.getMilliseconds() === 0)).toBe(true);
  expect(runs.length).toBe(ran);
});

it("a failing cron is logged, and the timer goes on", async () => {
  let tries = 0;
  const failing = createCron({ schedule: "* * * * * *" }, async () => {
    tries++;
    throw new Error("boom");
  });
  const stop = startCrons([{ name: "failing", ...failing }], { makeDeps });

  await new Promise((resolve) => setTimeout(resolve, 2100));
  stop();

  expect(tries).toBeGreaterThanOrEqual(2);
});
