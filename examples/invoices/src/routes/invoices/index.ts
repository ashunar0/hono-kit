/**
 * /invoices。請求書のリソース。共有（/:id/shares）は子のリソースとして shares/ にある
 */
import {
  createRouter,
  errorResponses,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
  Forbidden,
  NotFound,
} from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import {
  invoiceIdSchema,
  invoiceInputSchema,
  invoiceStatuses,
  NotDraft,
} from "../../domains/invoices/model";
import { invoiceResponse, invoiceResponseSchema } from "./response";
import { invoiceSharesRouter } from "./shares";

// 受け取る形。本文の入力は model の invoiceInputSchema
const invoiceParamsSchema = z.object({
  id: invoiceIdSchema,
});

const listInvoicesQuerySchema = pageQuerySchema(
  z.object({
    status: z.enum(invoiceStatuses).optional(),
  }),
);

// 返す形。請求書そのものは response.ts
const listInvoicesResponseSchema = pageResponseSchema(invoiceResponseSchema);

const deleteInvoiceResponseSchema = z.object({
  ok: z.literal(true),
});

export const invoicesRouter = createRouter()
  // 一覧
  .endpoint(
    {
      method: "get",
      path: "/",
      middleware: [requireAuth],
      request: { query: listInvoicesQuerySchema },
      responses: {
        200: listInvoicesResponseSchema,
      },
    },
    async (c, reply, { invoiceQueries }) => {
      const actor = c.get("actor");
      const page = await invoiceQueries.list(actor, c.req.valid("query"));

      return reply(200, pageResponse(page, invoiceResponse));
    },
  )
  // 1件
  .endpoint(
    {
      method: "get",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema },
      responses: {
        200: invoiceResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { invoiceQueries }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const invoice = await invoiceQueries.get(actor, id);
      if (invoice === null) return reply.failure(NotFound.code);

      return reply(200, invoiceResponse(invoice));
    },
  )
  // 作成
  .endpoint(
    {
      method: "post",
      path: "/",
      middleware: [requireAuth],
      request: { json: invoiceInputSchema },
      responses: {
        200: invoiceResponseSchema,
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const now = c.get("now");

      const row = await invoices.create(actor, input, now);

      return reply(200, invoiceResponse(row));
    },
  )
  // 更新
  .endpoint(
    {
      method: "put",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema, json: invoiceInputSchema },
      responses: {
        200: invoiceResponseSchema,
        ...errorResponses(NotFound, Forbidden),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const now = c.get("now");

      const result = await invoices.update(actor, id, input, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, invoiceResponse(result.value));
    },
  )
  // 送付
  .endpoint(
    {
      method: "post",
      path: "/:id/send",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema },
      responses: {
        200: invoiceResponseSchema,
        ...errorResponses(NotFound, Forbidden, NotDraft),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const now = c.get("now");

      const result = await invoices.send(actor, id, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, invoiceResponse(result.value));
    },
  )
  // 削除
  .endpoint(
    {
      method: "delete",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema },
      responses: {
        200: deleteInvoiceResponseSchema,
        ...errorResponses(NotFound, Forbidden),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const result = await invoices.remove(actor, id);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { ok: true });
    },
  )
  .route("/:id/shares", invoiceSharesRouter);
