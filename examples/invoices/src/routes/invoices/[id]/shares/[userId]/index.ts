/**
 * /invoices/:id/shares/:userId。その人への共有
 */
import { createEndpoint, errorResponses, Forbidden, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "#src/middleware/auth";
import { invoiceIdSchema } from "#src/domains/invoices/model";
import { okResponseSchema } from "../_response";

const shareParamsSchema = z.object({
  id: invoiceIdSchema,
  userId: z.string(),
});

/** 共有をやめる */
export const DELETE = createEndpoint(
  {
    middleware: [requireAuth],
    request: { param: shareParamsSchema },
    responses: {
      200: okResponseSchema,
      ...errorResponses(NotFound, Forbidden),
    },
  },
  async (c, reply, { invoices }) => {
    const actor = c.get("actor");
    const { id, userId } = c.req.valid("param");

    const result = await invoices.unshare(actor, id, userId);
    if (!result.ok) return reply.failure(result.error);

    return reply(200, { ok: true });
  },
);
