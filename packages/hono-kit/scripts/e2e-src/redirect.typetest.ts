import { createEndpoint, redirect } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "hono-kit";

const ok = z.object({ ok: z.literal(true) });

// 303 に宣言すれば、reply.redirect で返せる
export const declared = createEndpoint(
  { auth: allowAnonymous, responses: { 303: redirect() } },
  async (_c, reply) => reply.redirect("/dashboard"),
);

// 宣言していない endpoint では、赤線の文言が「宣言が無い。303: redirect() を足す」になる
export const none = createEndpoint(
  { auth: allowAnonymous, responses: { 200: ok } },
  async (_c, reply) => {
    // @ts-expect-error リダイレクトの宣言が無い
    return reply.redirect("/dashboard");
  },
);

// リダイレクトは 303 だけ。302 に置くと宣言に赤線
export const wrongStatus = createEndpoint(
  // @ts-expect-error redirect() は 303 にしか置けない
  { auth: allowAnonymous, responses: { 302: redirect() } },
  async (_c, reply) => reply.success({ ok: true } as never),
);
