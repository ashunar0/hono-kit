/**
 * /payments。支払いのリソース。
 * 支払えるかは invoices に問い、読んだ請求書を値で payments に渡す（書くのは payments の 1 回だけ）
 */
import { createRouter, errorResponses, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { invoiceIdSchema } from "../../domains/invoices/domain";
import { GatewayFailed, NotPayable, PaymentStarting } from "../../domains/payments/domain";

// 受け取る形
const startPaymentInputSchema = z.object({
  invoiceId: invoiceIdSchema,
});

// 返す形
const startPaymentResponseSchema = z.object({
  paymentId: z.string(),
  /** 利用者をここへ送る */
  checkoutUrl: z.string(),
});

export const paymentsRouter = createRouter()
  // 支払いを始める
  .endpoint(
    {
      method: "post",
      path: "/",
      middleware: [requireAuth],
      request: { json: startPaymentInputSchema },
      responses: {
        200: startPaymentResponseSchema,
        ...errorResponses(NotFound, NotPayable, PaymentStarting, GatewayFailed),
      },
    },
    async (c, reply, { invoices, payments }) => {
      const actor = c.get("actor");
      const { invoiceId } = c.req.valid("json");
      const now = new Date();

      // 支払えるのは、範囲の中で送付済みの請求書だけ（invoices のルール）
      const invoice = await invoices.getPayable(actor, invoiceId);
      if (!invoice.ok) return reply.failure(invoice.error);

      const result = await payments.start(invoice.value, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, {
        paymentId: result.value.payment.id,
        checkoutUrl: result.value.checkoutUrl,
      });
    },
  );
