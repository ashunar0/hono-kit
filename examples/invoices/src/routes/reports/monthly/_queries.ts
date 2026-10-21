/**
 * /reports/monthly の読み。請求と入金を、月ごとに並べる。
 * 自分のテーブルは持たず、invoices と payments の窓口（〜Within）から集計する。
 * 誰の分を数えるかは窓口が決める。ここは actor を渡すだけで、範囲の決め方は知らない
 */
import { and, eq, gte, inArray, lt, sql, type AnyColumn } from "drizzle-orm";
import type { ReadDb } from "../../../db";
import { billedStatuses } from "../../../domains/invoices/model";
import { invoicesWithin } from "../../../domains/invoices/repo.d1";
import { paymentsWithin } from "../../../domains/payments/repo.d1";
import type { Actor } from "../../../domains/users/model";
import { monthsBetween, nextMonth, startOfMonth, type Month } from "../../../lib/month";

/** 1 か月分の集計 */
export type MonthlySummary = {
  month: Month;
  /** 送付済み・支払い済みの請求書の金額（期限の月で数える） */
  invoiced: number;
  /** 成功した支払いの金額（成功した月で数える） */
  received: number;
};

/** timestamp_ms の列を、月（YYYY-MM、UTC）にする */
const monthOf = (column: AnyColumn) =>
  sql<string>`strftime('%Y-%m', ${column} / 1000, 'unixepoch')`;

export function reportsQueries(db: ReadDb) {
  /** 期間 [from, to) の、月ごとの請求額。請求済みとみなす状態は invoices が決める */
  const invoicedByMonth = (actor: Actor, from: Date, to: Date) => {
    const invoices = invoicesWithin(db, actor);
    const month = monthOf(invoices.dueAt);

    return db
      .select({ month, total: sql<number>`sum(${invoices.amount})` })
      .from(invoices)
      .where(
        and(
          inArray(invoices.status, billedStatuses),
          gte(invoices.dueAt, from),
          lt(invoices.dueAt, to),
        ),
      )
      .groupBy(month);
  };

  /** 期間 [from, to) の、月ごとの入金額 */
  const receivedByMonth = (actor: Actor, from: Date, to: Date) => {
    const payments = paymentsWithin(db, actor);
    const month = monthOf(payments.updatedAt);

    return db
      .select({ month, total: sql<number>`sum(${payments.amount})` })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.updatedAt, from),
          lt(payments.updatedAt, to),
        ),
      )
      .groupBy(month);
  };

  return {
    /** from から to まで（両端を含む）の月ごとの集計。データが無い月は 0 */
    async monthly(actor: Actor, from: Month, to: Month): Promise<MonthlySummary[]> {
      const start = startOfMonth(from);
      const end = startOfMonth(nextMonth(to));

      const [invoiced, received] = await Promise.all([
        invoicedByMonth(actor, start, end),
        receivedByMonth(actor, start, end),
      ]);
      const invoicedBy = new Map(invoiced.map((r) => [r.month, r.total]));
      const receivedBy = new Map(received.map((r) => [r.month, r.total]));

      return monthsBetween(from, to).map((month) => ({
        month,
        invoiced: invoicedBy.get(month) ?? 0,
        received: receivedBy.get(month) ?? 0,
      }));
    },
  };
}
