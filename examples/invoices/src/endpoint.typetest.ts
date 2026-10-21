import { createEndpoint, createApp, registerEndpoint } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "./middleware/auth";

const ok = z.object({ ok: z.literal(true) });
const app = createApp();

// path の :id と param の id が合っていれば通る
export const matched = createEndpoint(
  {
    middleware: [allowAnonymous],
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: ok },
  },
  async (c, reply) => {
    c.req.valid("param").id satisfies string;

    return reply(200, { ok: true });
  },
);
registerEndpoint(app, "GET", "/users/:id", matched);

// path は :userId なのに param は id。実行時は常に検査が失敗するので、登録の行で止める
// @ts-expect-error path のパラメータと request.param のキーが合っていない
registerEndpoint(app, "GET", "/users/:userId", matched);

// 親のパスにある param（:storeId）も、request.param に書く
export const nested = createEndpoint(
  {
    middleware: [allowAnonymous],
    request: { param: z.object({ storeId: z.string(), date: z.string() }) },
    responses: { 200: ok },
  },
  async (_c, reply) => reply(200, { ok: true }),
);
registerEndpoint(app, "GET", "/stores/:storeId/closed-dates/:date", nested);

// 親の param を書き忘れても止まる（path 全体を見る）
// @ts-expect-error :orgId が request.param に無い
registerEndpoint(app, "GET", "/orgs/:orgId/users/:id", matched);

// 宣言していない入力は読めない（json を宣言していないのに valid("json") を呼ぶ）
export const undeclared = createEndpoint(
  {
    middleware: [allowAnonymous],
    responses: { 200: ok },
  },
  async (c, reply) => {
    // @ts-expect-error json を宣言していない
    c.req.valid("json");

    return reply(200, { ok: true });
  },
);
