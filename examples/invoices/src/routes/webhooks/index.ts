/**
 * /webhooks。外のサービスからの通知の入口を、提供元ごとにつなぐ
 */
import { createRouter } from "hono-kit";
import { stripeWebhookRouter } from "./stripe";

export const webhooksRouter = createRouter().route("/stripe", stripeWebhookRouter);
