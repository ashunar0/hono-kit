import { scopeTo, wireDb } from "./db";
import type { AppEnv } from "./env";
import { invoicesService } from "./domains/invoices/service";
import { invoicesRepository, invoiceSharesTable, invoicesTable } from "./domains/invoices/repo.d1";
import { stripeGateway } from "./domains/payments/gateway.stripe";
import { paymentsRepository, paymentsTable } from "./domains/payments/repo.d1";
import { paymentsService } from "./domains/payments/service";
import { queuesReminderJobs } from "./domains/reminders/queue.cloudflare";
import { resendMailer } from "./domains/reminders/mailer.resend";
import { remindersRepository, remindersTable } from "./domains/reminders/repo.d1";
import { remindersService } from "./domains/reminders/service";
import { invoicesQueries } from "./routes/invoices/queries.d1";
import { reportsQueries } from "./routes/reports/queries.d1";

/**
 * domain の組み立て方を集める唯一の場所（composition root）。
 *
 * 組み立てた結果ではなく、組み立て方を buildApp に渡す。hnk の provideDeps が
 * リクエストごとに（handler が初めて受け取るときに 1 回）呼ぶ。HTTP 以外の inbound は createWorker が呼ぶ。
 * db はリクエストごとに作る——モジュールの外で作ると、接続を持つ DB では
 * リクエストをまたいで共有されてしまう。
 *
 * 上から順に const で組み立てる。依存する相手を先に書かないと、tsc が「宣言の前に使っている」で止める。
 * なので、domain の依存の輪はコンパイルが通らない（Go の main と同じ）。
 * domain どうしは何もつながない。複数の domain にまたがる処理は、入口（routes の handler、webhook、
 * cron、queue）が両方を受け取って、読んだものを値で渡す。
 * 全部の domain を毎回組み立てるが、関数を返すだけで env の検証も接続もしないので軽い。
 * db そのものは返さない。inbound が書き込み先を選べてしまうので
 */
export const makeDeps = (env: AppEnv["Bindings"]) => {
  const db = wireDb(env.DB);

  const invoices = invoicesService(
    invoicesRepository(scopeTo(db, invoicesTable), scopeTo(db, invoiceSharesTable)),
  );

  const payments = paymentsService(
    paymentsRepository(scopeTo(db, paymentsTable)),
    stripeGateway({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      successUrl: `${env.APP_URL}/payments/done`,
      cancelUrl: `${env.APP_URL}/payments/canceled`,
    }),
  );

  const reminders = remindersService(
    remindersRepository(scopeTo(db, remindersTable)),
    resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }),
    queuesReminderJobs(env.REMINDER_QUEUE),
  );

  // GET の読み。db を ReadDb（SELECT だけ）として受け取るので、書き込みは書けない
  const invoiceQueries = invoicesQueries(db);
  const reportQueries = reportsQueries(db);

  return { invoices, payments, reminders, invoiceQueries, reportQueries };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hono-kit" {
  interface Register {
    deps: Deps;
  }
}
