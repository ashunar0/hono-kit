import { createEndpoint, err, errorResponses, guard, NotFound, type Result } from "hono-kit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { allowAnonymous } from "hono-kit";

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

const Busy = { code: "BUSY", kind: "conflict", message: "Busy" } as const;
const Taken = { code: "TAKEN", kind: "conflict", message: "Taken" } as const;
const busyGuard = guard(
  [Busy],
  createMiddleware<{ Variables: { traceId: string } }>(async (_c, next) => next()),
);

// guard の失敗と handler の失敗が同じ status（どちらも 409）でも、handler は自分の失敗を返せる
export const guardSameStatus = createEndpoint(
  { auth: allowAnonymous, middleware: [busyGuard], responses: { 200: ok, ...errorResponses(Taken) } },
  async (_c, reply) => reply.failure("TAKEN"),
);

export const guardFailureNotReturned = createEndpoint(
  { auth: allowAnonymous, middleware: [busyGuard], responses: { 200: ok, ...errorResponses(Taken) } },
  // @ts-expect-error BUSY は guard が返すもので、handler は返さない
  async (_c, reply) => reply.failure("BUSY"),
);

// 同じ status（409）に details のある失敗と無い失敗が並んでも、それぞれの形で返せる
const sameStatus = { 200: ok, ...errorResponses(Taken, OverLimit) };

export const sameStatusMixed = createEndpoint(
  { auth: allowAnonymous, responses: sameStatus },
  async (_c, reply) =>
    Math.random() > 0.5
      ? reply.failure({ code: "OVER_LIMIT", details: { limit: 3 } })
      : reply.failure("TAKEN"),
);

// docs の勧める書き方：errorResponses を宣言の中でじかに呼び、関数が err に入れた失敗をそのまま渡す。
// （handler の中で code を文字で書くと、errorResponses をじかに呼んだときだけ TS が string に広げる。定数か err から渡す）
const checkOver = (): Result<void, { code: typeof OverLimit.code; details: { limit: number } }> =>
  err({ code: OverLimit.code, details: { limit: 3 } });

export const sameStatusInline = createEndpoint(
  { auth: allowAnonymous, responses: { 200: ok, ...errorResponses(Taken, OverLimit) } },
  async (_c, reply) => {
    const checked = checkOver();
    if (!checked.ok) return reply.failure(checked.error);
    if (Math.random() > 0.5) return reply.failure({ code: OverLimit.code, details: { limit: 3 } });
    return reply.failure("TAKEN");
  },
);
