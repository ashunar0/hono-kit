/**
 * キューから受け取る入口。利用者はいない。積まれた督促を 1 件ずつ送る。
 * 入口なので、2 つの module をここでつなぐ：督促してよいかを invoices に問い、結果を reminders に値で渡す
 * （督促してよくなければ null。reminders が見送りとして残す）。
 * ack と retry は createWorker が Result で決める（送れた・見送りは ok で ack、送れなかったら err で retry）。
 * now はメッセージが積まれた時刻。再送が日をまたいでも、同じ日の督促として扱える
 */
import type { QueueContext } from "hono-kit";
import { invoiceId } from "../invoices/domain";
import type { ReminderJob } from "./domain";

export async function sendReminder({ deps, actor, now, body }: QueueContext<ReminderJob>) {
  const invoice = await deps.invoices.getRemindable(actor, invoiceId(body.invoiceId), now);

  return deps.reminders.send(body, invoice.ok ? invoice.value : null, now);
}
