import { createEndpoint, type DepsVariables } from "hono-kit";
import { z } from "zod";
import { createMiddleware } from "hono/factory";
import type { Db } from "./db/index";
import { allowAnonymous } from "./middleware/auth";

const ok = z.object({ ok: z.literal(true) });

// handler は Hono の c.var から deps を読む。雛形の deps は { db }
export const handler = createEndpoint(
  { auth: allowAnonymous, responses: { 200: ok } },
  async (c, reply) => {
    c.var.deps.db satisfies Db;

    return reply.success({ ok: true });
  },
);

// middleware も同じ c.var.deps を読める（認証の middleware が db を自分で作らなくていい）
export const readsDeps = createMiddleware<{ Variables: DepsVariables }>(async (c, next) => {
  c.var.deps.db satisfies Db;
  await next();
});

// 3 つ目の引数はもう無い
export const third = createEndpoint(
  { auth: allowAnonymous, responses: { 200: ok } },
  // @ts-expect-error deps は c.var.deps にあり、handler の引数ではない
  async (_c, reply, _deps: unknown) => reply.success({ ok: true }),
);
