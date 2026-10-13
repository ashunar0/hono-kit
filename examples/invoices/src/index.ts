import type { MiddlewareHandler } from "hono";
import { createRouter, onError, provideDeps } from "hono-kit";
import { createWorker } from "hono-kit/worker";
import { openapiDocument } from "hono-kit/openapi";
import { makeDeps, type Deps } from "./deps";
import type { AppEnv } from "./env";
import { withUser } from "./middleware/auth";
import { enqueueOverdueReminders } from "./jobs/enqueue-overdue-reminders";
import type { ReminderJob } from "./domains/reminders/model";
import { sendReminder } from "./jobs/send-reminder";
import { invoicesRouter } from "./routes/invoices";
import { paymentsRouter } from "./routes/payments";
import { reportsRouter } from "./routes/reports";
import { webhooksRouter } from "./routes/webhooks";

/** zod の日付は JSON Schema で表せないので、文書には日時の文字列として出す */
const dateAsString = (ctx: {
  zodSchema: { _zod: { def: { type: string } } };
  jsonSchema: Record<string, unknown>;
}) => {
  if (ctx.zodSchema._zod.def.type === "date")
    Object.assign(ctx.jsonSchema, { type: "string", format: "date-time" });
};

/**
 * アプリを組み立てる。依存の組み立て方と、ログイン状態の決め方を外から受け取るので、
 * 本番は makeDeps と withUser を、テストは偽物を渡す。
 * authenticate はセッションの user（ログインしていなければ null）を文脈に積む middleware。認証の提供元を差し込む場所
 */
export const buildApp = (
  makeDeps: (env: AppEnv["Bindings"]) => Deps,
  authenticate: MiddlewareHandler<AppEnv> = withUser,
) => {
  const root = createRouter();

  const app = root
    .use("*", provideDeps(makeDeps))
    .use("*", authenticate)
    .route("/invoices", invoicesRouter)
    .route("/payments", paymentsRouter)
    .route("/reports", reportsRouter)
    .route("/webhooks", webhooksRouter)
    .onError(onError);

  // 登録された route の宣言から作る。リクエストのたびに読むので、登録の順番に関係しない
  app.get("/openapi.json", (c) =>
    c.json(
      openapiDocument(
        app,
        { title: "invoices", version: "0.0.0" },
        { libraryOptions: { override: dateAsString } },
      ),
    ),
  );

  return app;
};

export type ApiApp = ReturnType<typeof buildApp>;

const app = buildApp(makeDeps);

/**
 * Workers の入口。HTTP は app、時刻は cron、キューは queue に渡す。
 * 依存の組み立て、actor（システム）、now、ack と retry は createWorker が受け持つ
 */
export default createWorker<ReminderJob>({
  makeDeps,
  fetch: app.fetch,
  scheduled: enqueueOverdueReminders,
  queue: sendReminder,
});
