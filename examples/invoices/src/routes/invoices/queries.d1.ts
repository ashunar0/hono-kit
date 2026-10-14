/**
 * /invoices の読み（一覧と 1 件）。請求書は invoices の窓口（invoicesWithin）からだけ読む。
 * 誰が何に触れるかは窓口が決めるので、ここは actor を渡すだけ。範囲を付け忘れる書き方が存在しない
 */
import { and, desc, eq, lt, or } from "drizzle-orm";
import { toPage, type Page, type PageQuery } from "hono-kit/page";
import type { ReadDb } from "../../db";
import type { InvoiceId, InvoiceStatus } from "../../domains/invoices/model";
import { invoicesWithin } from "../../domains/invoices/repo.d1";
import type { Actor } from "../../domains/users/model";

/** 画面に出す請求書の 1 行 */
export type InvoiceRow = {
  id: string;
  title: string;
  body: string;
  amount: number;
  customerEmail: string;
  dueAt: Date;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
};

/** 一覧の条件。位置と件数は hnk の PageQuery */
export type InvoiceListQuery = PageQuery & {
  status?: InvoiceStatus;
};

export function invoicesQueries(db: ReadDb) {
  /** その人が触れる請求書を、画面に出す列だけで */
  const seen = (actor: Actor) => {
    const invoices = invoicesWithin(db, actor);
    const query = db
      .select({
        id: invoices.id,
        title: invoices.title,
        body: invoices.body,
        amount: invoices.amount,
        customerEmail: invoices.customerEmail,
        dueAt: invoices.dueAt,
        status: invoices.status,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
      })
      .from(invoices);

    return { invoices, query };
  };

  return {
    /** 触れる範囲のものを、更新の新しい順に 1 ページ */
    async list(
      actor: Actor,
      { status, after, limit }: InvoiceListQuery,
    ): Promise<Page<InvoiceRow>> {
      const { invoices, query } = seen(actor);
      // 1 件多く読んで、続きがあるかを知る
      const rows = await query
        .where(
          and(
            status ? eq(invoices.status, status) : undefined,
            after
              ? or(
                  lt(invoices.updatedAt, after.at),
                  and(eq(invoices.updatedAt, after.at), lt(invoices.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(invoices.updatedAt), desc(invoices.id))
        .limit(limit + 1);

      return toPage(rows, limit, (invoice) => ({ at: invoice.updatedAt, id: invoice.id }));
    },

    /** 範囲の外のものは null。在ることも知らせない */
    async get(actor: Actor, id: InvoiceId): Promise<InvoiceRow | null> {
      const { invoices, query } = seen(actor);
      const [row] = await query.where(eq(invoices.id, id)).limit(1);

      return row ?? null;
    },
  };
}
