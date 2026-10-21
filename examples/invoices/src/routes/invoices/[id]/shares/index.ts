/**
 * /invoices/:id/shares。請求書の共有。やめるのは [userId]/
 */
import { createEndpoint, errorResponses, Forbidden, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "#src/middleware/auth";
import { invoiceIdSchema, shareLevels } from "#src/domains/invoices/model";
import { okResponseSchema } from "./_response";

// 親のパスの :id も、ここで検査する
const invoiceParamsSchema = z.object({
  id: invoiceIdSchema,
});

const shareInputSchema = z.object({
  /** 共有する相手 */
  userId: z.string().min(1),
  level: z.enum(shareLevels),
});

/** 共有 */
export const PUT = createEndpoint(
  {
    middleware: [requireAuth],
    request: { param: invoiceParamsSchema, json: shareInputSchema },
    responses: {
      200: okResponseSchema,
      ...errorResponses(NotFound, Forbidden),
    },
  },
  async (c, reply, { invoices }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");
    const { userId, level } = c.req.valid("json");

    const result = await invoices.share(actor, id, userId, level);
    if (!result.ok) return reply.failure(result.error);

    return reply(200, { ok: true });
  },
);
