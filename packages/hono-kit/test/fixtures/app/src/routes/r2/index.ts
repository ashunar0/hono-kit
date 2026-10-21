// expect: hnk(route-replies-through-reply) | Return with reply instead of c.json()
import { createApp } from "hono-kit";

const r2Router = createApp();
void r2Router;

const handler = (c: { json: (b: unknown) => unknown }) => c.json({ ok: true });
void handler;
