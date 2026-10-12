/**
 * /invoices/:id/shares。請求書の共有。親（invoices）が .route("/:id/shares", ...) でつなぐ
 */
import { createRouter, errorResponses, Forbidden, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import { invoiceIdSchema, shareLevels } from "../../../modules/invoices/domain";

// 親のパスの :id も、ここで検査する
const invoiceParamsSchema = z.object({
  id: invoiceIdSchema,
});

const shareInputSchema = z.object({
  /** 共有する相手 */
  userId: z.string().min(1),
  level: z.enum(shareLevels),
});

const shareParamsSchema = z.object({
  id: invoiceIdSchema,
  userId: z.string(),
});

const okResponseSchema = z.object({ ok: z.literal(true) });

export const invoiceSharesRouter = createRouter()
  // 共有
  .endpoint(
    {
      method: "put",
      path: "/",
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
  )
  // 共有をやめる
  .endpoint(
    {
      method: "delete",
      path: "/:userId",
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
