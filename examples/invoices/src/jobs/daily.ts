/**
 * 時刻で動く入口。利用者はいない。毎朝、期限切れの請求書の督促をキューに積む。
 * 入口なので、2 つの domain をここでつなぐ：invoices から読み、reminders に値で渡す。
 * 誰として呼ぶか（actor）と、いつの出来事か（now）は、Workers の入口（createWorker）が渡す
 */
import type { CronContext } from "hono-kit";

export async function enqueueOverdueReminders({ deps, actor, now }: CronContext) {
  const overdue = await deps.invoices.read.listOverdue(actor, now);
  const count = await deps.reminders.write.enqueueOverdue(overdue);

  console.log(`reminders: ${count} 件を積んだ`);
}
