/**
 * /reports/monthly。月ごとの集計のリソース
 */
import { createEndpoint } from "hono-kit";
import { z } from "zod";
import { requireRole } from "#src/middleware/auth";
import { monthsBetween, type Month } from "#src/lib/month";

/** 1 回に出せる月の数。重い集計で詰まらないように */
const MAX_MONTHS = 24;

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月は YYYY-MM で指定してください")
  .transform((value) => value as Month);

// 受け取る形
const monthlyQuerySchema = z
  .object({ from: monthSchema, to: monthSchema })
  .refine(({ from, to }) => from <= to, "from は to 以前にしてください")
  .refine(
    ({ from, to }) => monthsBetween(from, to).length <= MAX_MONTHS,
    `一度に出せるのは ${MAX_MONTHS} か月までです`,
  );

// 返す形
const monthlyResponseSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      invoiced: z.number(),
      received: z.number(),
    }),
  ),
});

/** 月ごとの請求と入金 */
export const GET = createEndpoint(
  {
    // レポートを見られるのは admin だけ。役割だけで決まるので guard に置く
    middleware: [requireRole("admin")],
    request: { query: monthlyQuerySchema },
    responses: { 200: monthlyResponseSchema },
  },
  async (c, reply, { reportsQueries }) => {
    const actor = c.get("actor");
    const { from, to } = c.req.valid("query");

    return reply(200, { months: await reportsQueries.monthly(actor, from, to) });
  },
);
