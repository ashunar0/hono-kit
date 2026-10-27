import { createEndpoint, file } from "hono-kit";
import { allowAnonymous } from "./middleware/auth";

// file() の endpoint では、reply.success に中身と種類を渡す
export const declared = createEndpoint(
  { auth: allowAnonymous, responses: { 200: file() } },
  async (_c, reply) => reply.success({ body: "hello", contentType: "text/plain" }),
);

// 中身ではなくデータを渡すと、その引数に赤線
export const wrongBody = createEndpoint(
  { auth: allowAnonymous, responses: { 200: file() } },
  async (_c, reply) => {
    // @ts-expect-error file() の endpoint は { body, contentType } を取る
    return reply.success({ ok: true });
  },
);
