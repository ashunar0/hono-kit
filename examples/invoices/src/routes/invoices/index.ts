/**
 * /invoices。請求書のリソース。1 件は [id]/、共有は [id]/shares/ にある
 */
import { createEndpoint, pageQuerySchema, pageResponse, pageResponseSchema } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { invoiceInputSchema, invoiceStatuses } from "../../domains/invoices/model";
import { invoiceResponse, invoiceResponseSchema } from "./_response";

// 受け取る形。本文の入力は model の invoiceInputSchema
const listInvoicesQuerySchema = pageQuerySchema(
  z.object({
    status: z.enum(invoiceStatuses).optional(),
  }),
);

// 返す形。請求書そのものは _response.ts
const listInvoicesResponseSchema = pageResponseSchema(invoiceResponseSchema);

/** 一覧 */
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    request: { query: listInvoicesQuerySchema },
    responses: {
      200: listInvoicesResponseSchema,
    },
  },
  async (c, reply, { invoicesQueries }) => {
    const actor = c.get("actor");
    const page = await invoicesQueries.list(actor, c.req.valid("query"));

    return reply(200, pageResponse(page, invoiceResponse));
  },
);

/** 作成 */
export const POST = createEndpoint(
  {
    middleware: [requireAuth],
    request: { json: invoiceInputSchema },
    responses: {
      200: invoiceResponseSchema,
    },
  },
  async (c, reply, { invoices, invoicesQueries }) => {
    const actor = c.get("actor");
    const input = c.req.valid("json");
    const now = c.get("now");

    const id = await invoices.create(actor, input, now);

    // 書いた後は、GET と同じ道で読み直して返す。書けた直後に無いのは想定外
    const invoice = await invoicesQueries.get(actor, id);
    if (invoice === null) throw new Error(`invoice ${id} is gone right after the write`);

    return reply(200, invoiceResponse(invoice));
  },
);
