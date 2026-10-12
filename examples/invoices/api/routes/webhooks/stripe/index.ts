/**
 * /webhooks/stripe。決済サービスからの通知を受ける入口。
 * 利用者ではなく Stripe が呼ぶので、ログインではなく署名で確かめる。
 *
 * 成功なら、支払いを成功にしてから、請求書を支払い済みにする。2 つの module に書くが、
 * 再送のある入口なので、どちらも何度やっても同じ結果にしておけば、順に書いてよい。
 * 途中で落ちたら 200 以外が返り、決済サービスの再送でやり直す
 */
import { allowSystem, createRouter, errorResponses, NotFound } from "hono-kit";
import { z } from "zod";
import { NotPayable } from "../../../modules/payments/domain";
import { InvalidSignature } from "../../../modules/payments/errors";
import { invoiceId } from "../../../modules/invoices/domain";

const receivedSchema = z.object({ received: z.literal(true) });

export const stripeWebhookRouter = createRouter().endpoint(
  {
    method: "post",
    path: "/",
    middleware: [allowSystem],
    responses: {
      200: receivedSchema,
      ...errorResponses(InvalidSignature, NotFound, NotPayable),
    },
  },
  async (c, reply, { invoices, payments }) => {
    const actor = c.get("actor");
    // 署名は受け取ったままの本文に対して確かめるので、JSON として読まない
    const payload = await c.req.text();
    const signature = c.req.header("Stripe-Signature") ?? "";
    const now = new Date();

    const event = await payments.verifyEvent(payload, signature);
    if (!event.ok) return reply.failure(event.error);
    // 支払いに関係ない通知は、受け取ったことだけ返す
    if (event.value === null) return reply(200, { received: true });

    // 利用者のいない inbound なので、システムとして渡す（署名を確かめた後に）
    const payment = await payments.receive(actor, event.value, now);
    if (!payment.ok) return reply.failure(payment.error);
    if (payment.value.status !== "succeeded") return reply(200, { received: true });

    const paid = await invoices.markPaid(actor, invoiceId(payment.value.invoiceId), now);
    if (!paid.ok) return reply.failure(paid.error);

    return reply(200, { received: true });
  },
);
