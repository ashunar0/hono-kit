/**
 * /invoices/:id/send。請求書を送付する
 */
import { createEndpoint, errorResponses, Forbidden, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "#src/middleware/auth";
import { invoiceIdSchema, NotDraft } from "#src/domains/invoices/model";
import { invoiceResponse, invoiceResponseSchema } from "../../_response";

const invoiceParamsSchema = z.object({
  id: invoiceIdSchema,
});

/** 送付 */
export const POST = createEndpoint(
  {
    middleware: [requireAuth],
    request: { param: invoiceParamsSchema },
    responses: {
      200: invoiceResponseSchema,
      ...errorResponses(NotFound, Forbidden, NotDraft),
    },
  },
  async (c, reply, { invoices, invoicesQueries }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");
    const now = c.get("now");

    const result = await invoices.send(actor, id, now);
    if (!result.ok) return reply.failure(result.error);

    const invoice = await invoicesQueries.get(actor, id);
    if (invoice === null) throw new Error(`invoice ${id} is gone right after the write`);

    return reply(200, invoiceResponse(invoice));
  },
);
