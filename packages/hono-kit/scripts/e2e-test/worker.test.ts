import { type CronContext, err, ok } from "hono-kit";
import { createWorker } from "hono-kit/worker";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { buildApp, makeDeps } from "#src/main";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const controller = (cron: string) =>
  ({ cron, scheduledTime: Date.UTC(2026, 9, 1, 8), noRetry: () => {} }) as ScheduledController;

it("scheduled: a job gets deps and now, and the controller to tell crons apart", async () => {
  const ran: string[] = [];
  // A job that reads only deps and now takes CronContext, so a test calls it with { deps, now }
  const daily = async ({ now }: CronContext) => void ran.push(`daily ${now.toISOString()}`);
  const worker = createWorker({
    makeDeps,
    fetch: buildApp().fetch,
    scheduled: async ({ deps, now, controller, ctx }) => {
      expect(deps.db).toBeDefined();
      expect(ctx.waitUntil).toBeTypeOf("function");
      if (controller.cron === "0 8 * * *") return daily({ deps, now });
      ran.push(`other ${controller.cron}`);
    },
  });

  await worker.scheduled!(controller("0 8 * * *"), env, ctx);
  await worker.scheduled!(controller("0 0 1 * *"), env, ctx);

  expect(ran).toEqual(["daily 2026-10-01T08:00:00.000Z", "other 0 0 1 * *"]);
});

it("queue: a job gets the message too, and its Result acks or retries it", async () => {
  const done: string[] = [];
  const message = (id: string, body: number) => ({
    id,
    body,
    attempts: 2,
    timestamp: new Date(0),
    ack: () => done.push(`ack ${id}`),
    retry: () => done.push(`retry ${id}`),
  });
  const worker = createWorker<number>({
    makeDeps,
    fetch: buildApp().fetch,
    queue: async ({ body, message }) => {
      expect(message.attempts).toBe(2);
      return body > 0 ? ok(undefined) : err("AGAIN");
    },
  });

  const batch = { messages: [message("a", 1), message("b", 0)] } as unknown as MessageBatch<number>;
  await worker.queue!(batch, env, ctx);

  expect(done).toEqual(["ack a", "retry b"]);
});
