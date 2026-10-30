import { expect, it } from "vitest";
import { beats, cron } from "#/crons/heartbeat";
import { makeDeps } from "#/main";
import { crons } from "#/routes.gen";
import { env } from "./bindings";

/** makeDeps takes the bindings on Workers and nothing on Node */
const deps = () => (makeDeps as (bindings: typeof env) => ReturnType<typeof makeDeps>)(env);

it("lists the crons in src/crons, named by their file", () => {
  expect(crons.map((c) => `${c.name} ${c.schedule}`)).toEqual(["heartbeat 0 8 * * *"]);
});

it("a test calls a cron's run with { deps, now }", async () => {
  beats.length = 0;
  await cron.run({ deps: deps(), now: new Date("2026-10-01T08:00:00Z") });
  expect(beats).toEqual(["2026-10-01T08:00:00.000Z"]);
});
