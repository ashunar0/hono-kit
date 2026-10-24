/**
 * /invoices/:id。請求書 1 件
 */
import { createEndpoint, errorResponses, Forbidden, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "#src/middleware/auth";
import { invoiceIdSchema, invoiceInputSchema } from "#src/domains/invoices/model";
import { invoiceResponse, invoiceResponseSchema } from "../_response";

// 受け取る形。本文の入力は model の invoiceInputSchema
const invoiceParamsSchema = z.object({
  id: invoiceIdSchema,
});

// 返す形。請求書そのものは _response.ts
const deleteInvoiceResponseSchema = z.object({
  ok: z.literal(true),
});

/** 1件 */
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { param: invoiceParamsSchema },
    responses: {
      200: invoiceResponseSchema,
      ...errorResponses(NotFound),
    },
  },
  async (c, reply, { invoicesQueries }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");

    const invoice = await invoicesQueries.get(actor, id);
    if (invoice === null) return reply.failure(NotFound.code);

    return reply(200, invoiceResponse(invoice));
  },
);

/** 更新 */
export const PUT = createEndpoint(
  {
    auth: requireAuth,
    request: { param: invoiceParamsSchema, json: invoiceInputSchema },
    responses: {
      200: invoiceResponseSchema,
      ...errorResponses(NotFound, Forbidden),
    },
  },
  async (c, reply, { invoices, invoicesQueries }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const now = c.get("now");

    const result = await invoices.write.update(actor, id, input, now);
    if (!result.ok) return reply.failure(result.error);

    const invoice = await invoicesQueries.get(actor, id);
    if (invoice === null) throw new Error(`invoice ${id} is gone right after the write`);

    return reply(200, invoiceResponse(invoice));
  },
);

/** 削除 */
export const DELETE = createEndpoint(
  {
    auth: requireAuth,
    request: { param: invoiceParamsSchema },
    responses: {
      200: deleteInvoiceResponseSchema,
      ...errorResponses(NotFound, Forbidden),
    },
  },
  async (c, reply, { invoices }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");

    const result = await invoices.write.remove(actor, id);
    if (!result.ok) return reply.failure(result.error);

    return reply(200, { ok: true });
  },
);
