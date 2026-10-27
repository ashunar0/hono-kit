import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "./middleware/auth";

const ok = z.object({ ok: z.literal(true) });

// 宣言した失敗は返せる
export const declared = createEndpoint(
  {
    auth: allowAnonymous,
    responses: { 200: ok, ...errorResponses(NotFound) },
  },
  async (_c, reply) => reply.failure("NOT_FOUND"),
);

// 失敗を何も宣言していない endpoint では、赤線の文言が「宣言が無い。errorResponses を足す」になる
export const none = createEndpoint(
  { auth: allowAnonymous, responses: { 200: ok } },
  // @ts-expect-error 失敗の宣言が無い
  async (_c, reply) => reply.failure("NOT_FOUND"),
);

// 一部だけ宣言している endpoint では、宣言していないコードは通らない
export const some = createEndpoint(
  {
    auth: allowAnonymous,
    responses: { 200: ok, ...errorResponses(NotFound) },
  },
  // @ts-expect-error FORBIDDEN は宣言していない
  async (_c, reply) => reply.failure("FORBIDDEN"),
);

// 成功の本文が 200 の形と合わないと、handler の頭ではなく、その引数に赤線が付く
export const wrongBody = createEndpoint(
  { auth: allowAnonymous, responses: { 200: ok } },
  async (_c, reply) => {
    // @ts-expect-error ok は true だけ
    return reply.success({ ok: false });
  },
);
