// expect: hnk(route-replies-through-reply) | Return with reply instead of c.json()
import { createRouter } from "hono-kit";

export const r2Router = createRouter();

const handler = (c: { json: (b: unknown) => unknown }) => c.json({ ok: true });
void handler;
