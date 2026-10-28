import { createEndpoint, err, errorResponses, NotFound, type Result } from "hono-kit";
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

const OverLimit = {
  code: "OVER_LIMIT",
  kind: "conflict",
  message: "Over the limit",
  details: z.object({ limit: z.number() }),
} as const;

const withDetails = { 200: ok, ...errorResponses(NotFound, OverLimit) };

// details を宣言した失敗は { code, details } で返す。宣言していない失敗は今までどおり code だけ
export const detailed = createEndpoint(
  { auth: allowAnonymous, responses: withDetails },
  async (_c, reply) =>
    Math.random() > 0.5
      ? reply.failure({ code: "OVER_LIMIT", details: { limit: 3 } })
      : reply.failure("NOT_FOUND"),
);

// 関数が err に入れた失敗を、そのまま渡せる
const check = (): Result<void, { code: typeof OverLimit.code; details: { limit: number } }> =>
  err({ code: OverLimit.code, details: { limit: 3 } });

export const passedThrough = createEndpoint(
  { auth: allowAnonymous, responses: withDetails },
  async (_c, reply) => {
    const checked = check();
    if (!checked.ok) return reply.failure(checked.error);
    return reply.success({ ok: true });
  },
);

export const withoutDetails = createEndpoint(
  { auth: allowAnonymous, responses: withDetails },
  // @ts-expect-error details を宣言した失敗は、code だけでは返せない
  async (_c, reply) => reply.failure("OVER_LIMIT"),
);

export const wrongDetails = createEndpoint(
  { auth: allowAnonymous, responses: withDetails },
  async (_c, reply) =>
    // @ts-expect-error details の形が宣言と合わない
    reply.failure({ code: "OVER_LIMIT", details: { limit: "3" } }),
);

export const detailsOnPlain = createEndpoint(
  { auth: allowAnonymous, responses: withDetails },
  // @ts-expect-error details を宣言していない失敗には渡せない
  async (_c, reply) => reply.failure({ code: "NOT_FOUND", details: {} }),
);
