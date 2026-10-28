import { createEndpoint } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "hono-kit";

const invoice = z.object({ id: z.string(), amount: z.number() });
type Invoice = z.infer<typeof invoice>;

// JSON があれば、reply.success はその形のデータを取る
export const both = createEndpoint(
  {
    auth: allowAnonymous,
    responses: {
      200: {
        "application/json": invoice,
        "text/html": (data: Invoice) => <p>{data.amount}</p>,
      },
    },
  },
  async (_c, reply) => {
    // @ts-expect-error amount が無い
    if (Math.random() > 1) return reply.success({ id: "x" });
    return reply.success({ id: "x", amount: 1 });
  },
);

// HTML だけなら、作り方の引数の型が reply.success に渡すデータになる
export const htmlOnly = createEndpoint(
  {
    auth: allowAnonymous,
    responses: { 200: { "text/html": (data: Invoice) => <p>{data.id}</p> } },
  },
  async (_c, reply) => {
    // @ts-expect-error id が無い
    if (Math.random() > 1) return reply.success({ amount: 1 });
    return reply.success({ id: "x", amount: 1 });
  },
);

// 作り方が JSON の形を受け取れないと、宣言に赤線
export const mismatch = createEndpoint(
  {
    auth: allowAnonymous,
    responses: {
      200: {
        "application/json": invoice,
        // @ts-expect-error JSON は Invoice なのに、作り方は名前を受け取るつもり
        "text/html": (data: { name: string }) => <p>{data.name}</p>,
      },
    },
  },
  async (_c, reply) => reply.success({ id: "x", amount: 1 }),
);
