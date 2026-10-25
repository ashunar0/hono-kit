/**
 * 請求書の読み。domain のルール（model）を通して、請求書を返す。
 * 入口が次の書き込みの前に問い、読んだものを値で渡す（支払えるか → payments、督促してよいか → reminders）。
 * 画面に出す形の読みはここではなく、リソースの _queries.ts
 */
import { err, ok, type Result } from "hono-kit/result";
import { NotFound } from "hono-kit/failures";
import type { Actor } from "#src/domains/accounts/model";
import { isPayable, isRemindable, reachOf, type Invoice, type InvoiceId } from "./model";
import type { InvoicesRepository } from "./service";

/** 読みが使う、保存の形の読みの部分。書く method は受け取らないので、ここでは書けない */
export type InvoicesReads = Pick<InvoicesRepository, "find" | "listOverdue">;

/**
 * 引数の順番は service と同じ。誰として（actor）→ 何を → いつ（now）。
 * 時計は読まない。時刻が要る読みは、入口が決めた now を受け取る
 */
export function invoicesReader(repo: InvoicesReads) {
  return {
    /** 期限切れのもの。範囲の中だけ */
    async listOverdue(actor: Actor, now: Date): Promise<Invoice[]> {
      return repo.listOverdue(reachOf(actor), now);
    },

    /** 督促してよい請求書。範囲の中で、期限切れのものだけ */
    async getRemindable(
      actor: Actor,
      id: InvoiceId,
      now: Date,
    ): Promise<Result<Invoice, typeof NotFound.code | "NOT_REMINDABLE">> {
      const found = await repo.find(reachOf(actor), id);
      if (found === null) return err(NotFound.code);
      if (!isRemindable(found.invoice, now)) return err("NOT_REMINDABLE");

      return ok(found.invoice);
    },

    /** 支払いに進める請求書。範囲の中で、送付済みのものだけ */
    async getPayable(
      actor: Actor,
      id: InvoiceId,
    ): Promise<Result<Invoice, typeof NotFound.code | "NOT_PAYABLE">> {
      const found = await repo.find(reachOf(actor), id);
      if (found === null) return err(NotFound.code);
      if (!isPayable(found.invoice)) return err("NOT_PAYABLE");

      return ok(found.invoice);
    },
  };
}

export type InvoicesReader = ReturnType<typeof invoicesReader>;
