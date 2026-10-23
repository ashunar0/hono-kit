import { createEndpoint, createApp, defineAuth, registerEndpoint } from "hono-kit";
import { z } from "zod";
import { createMiddleware } from "hono/factory";
import { allowAnonymous, requireAuth, withAccount } from "./middleware/auth";
import { accountId, authenticatedAccount, orgId, type Account } from "./domains/accounts/model";

const ok = z.object({ ok: z.literal(true) });
const app = createApp();

// path の :id と param の id が合っていれば通る
export const matched = createEndpoint(
  {
    auth: allowAnonymous,
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
    auth: allowAnonymous,
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
    auth: allowAnonymous,
    responses: { 200: ok },
  },
  async (c, reply) => {
    // @ts-expect-error json を宣言していない
    c.req.valid("json");

    return reply(200, { ok: true });
  },
);

// createEndpoint を通らない素の配列は、handler の形が同じでも endpoint ではない
// （宣言が無い＝認証も responses の契約も無い）。registerEndpoint の行で止める
const plain = [async () => new Response("public")];
// @ts-expect-error createEndpoint で作っていない。宣言（認証・responses）が無い
registerEndpoint(app, "GET", "/public", plain);

// 誰が呼べるか（auth）を書かない endpoint は作れない。公開なら allowAnonymous を書く
export const noAuth = createEndpoint(
  // @ts-expect-error auth が無い
  { responses: { 200: ok } },
  async (_c, reply) => reply(200, { ok: true }),
);

// withAccount は誰を通すか決めない（session を積むだけ）。defineAuth で包んでいないので auth には書けない
export const authNotWrapped = createEndpoint(
  // @ts-expect-error withAccount は defineAuth で包んでいない
  { auth: withAccount, responses: { 200: ok } },
  async (_c, reply) => reply(200, { ok: true }),
);

// 素の createMiddleware（型引数なし）は Env が any。defineAuth で包んでいない時点で auth には書けない
const rawMiddleware = createMiddleware(async (_c, next) => {
  await next();
});
export const authRawMiddleware = createEndpoint(
  // @ts-expect-error defineAuth で包んでいない
  { auth: rawMiddleware, responses: { 200: ok } },
  async (_c, reply) => reply(200, { ok: true }),
);

// defineAuth で包んでも、Env が any のままでは通さない（c.get がすべて any になるのを防ぐ）
// @ts-expect-error Env が any
defineAuth(rawMiddleware);

// 型を付けた Env なら defineAuth が通り、handler で c.get("actor") の型が付く
const typedMiddleware = createMiddleware<{ Variables: { actor: Account } }>(async (c, next) => {
  c.set("actor", authenticatedAccount(accountId("u1"), orgId("o1"), "member"));
  await next();
});
export const authTyped = createEndpoint(
  { auth: defineAuth(typedMiddleware), responses: { 200: ok } },
  async (c, reply) => {
    c.get("actor") satisfies Account;
    // @ts-expect-error actor は Account、number ではない
    c.get("actor") satisfies number;

    return reply(200, { ok: true });
  },
);

// auth の後に middleware を足しても、両方が入れたものを handler が読める
const withTraceId = createMiddleware<{ Variables: { traceId: string } }>(async (c, next) => {
  c.set("traceId", "t");
  await next();
});
export const authAndMiddleware = createEndpoint(
  {
    auth: requireAuth,
    middleware: [withTraceId],
    responses: { 200: ok },
  },
  async (c, reply) => {
    c.get("actor") satisfies Account;
    c.get("traceId") satisfies string;

    return reply(200, { ok: true });
  },
);
