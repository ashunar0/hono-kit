/**
 * 請求書の手順（How）。domain のモノを使って、何をどの順でやるか
 */
import { err, ok, type Result } from "hono-kit/result";
import { Forbidden, NotFound } from "hono-kit/failures";
import type { System } from "hono-kit/system";
import type { Actor, User } from "../users/model";
import {
  canEdit,
  canManage,
  canSend,
  isPayable,
  isRemindable,
  isSendable,
  newInvoiceId,
  reachOf,
  type Invoice,
  type InvoiceAccess,
  type InvoiceChanges,
  type InvoiceId,
  type InvoiceInput,
  type InvoiceReach,
  type InvoiceStatus,
  type ShareLevel,
  NotDraft,
} from "./model";

/**
 * 手順が必要とする保存の形。使う側のここで宣言し、repo.d1.ts がそれを満たす。
 * service は保存の実装を知らないので、テストでは同じ形の偽物を渡せる
 */
export type InvoicesRepository = {
  /** 範囲の中の、送付済みで期限を過ぎたもの */
  listOverdue(reach: InvoiceReach, now: Date): Promise<Invoice[]>;
  /** 範囲の中に無ければ null。あれば、操作する人がどの関係で触れているか（access）と一緒に返す */
  find(
    reach: InvoiceReach,
    id: InvoiceId,
  ): Promise<{ invoice: Invoice; access: InvoiceAccess } | null>;
  insert(invoice: Invoice): Promise<Invoice>;
  /**
   * 範囲の中のものだけを書き換える。無ければ null。
   * from を渡すと、その状態のときだけ書き換える（確認と書き込みの間に状態が変わっても壊れない）
   */
  update(
    reach: InvoiceReach,
    id: InvoiceId,
    changes: InvoiceChanges,
    from?: InvoiceStatus,
  ): Promise<Invoice | null>;
  /** 範囲の中のものだけを消す。消せたら true */
  delete(reach: InvoiceReach, id: InvoiceId): Promise<boolean>;
  /** 共有する。同じ相手にもう共有していれば、権限を置き換える */
  upsertShare(share: { invoiceId: InvoiceId; userId: string; level: ShareLevel }): Promise<void>;
  /** 共有をやめる。無ければ何もしない */
  deleteShare(invoiceId: InvoiceId, userId: string): Promise<void>;
};

/**
 * 引数の順番は、誰として（actor）→ 何を → どうする → いつ（now）。
 * 時計は読まない。時刻が要る手順は、入口が決めた now を受け取る
 */
export function invoicesService(repo: InvoicesRepository) {
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

    /** 作成。作った人が所有者になる */
    async create(actor: User, input: InvoiceInput, now: Date): Promise<InvoiceId> {
      const created = await repo.insert({
        id: newInvoiceId(),
        orgId: actor.orgId,
        ownerId: actor.id,
        title: input.title,
        body: input.body,
        amount: input.amount,
        customerEmail: input.customerEmail,
        dueAt: input.dueAt,
        // 作った直後は下書き
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });

      return created.id;
    },

    /**
     * 書き換えられるのは、範囲の中で、編集できる関係のものだけ。
     * 見た後に共有が取り消されても、書き込みは範囲（組織）の中に留まる
     */
    async update(
      actor: Actor,
      id: InvoiceId,
      input: InvoiceInput,
      now: Date,
    ): Promise<Result<void, typeof NotFound.code | typeof Forbidden.code>> {
      const reach = reachOf(actor);

      const found = await repo.find(reach, id);
      if (found === null) return err(NotFound.code);
      if (!canEdit(found.access)) return err(Forbidden.code);

      const updated = await repo.update(reach, id, {
        title: input.title,
        body: input.body,
        amount: input.amount,
        customerEmail: input.customerEmail,
        dueAt: input.dueAt,
        updatedAt: now,
      });
      if (updated === null) return err(NotFound.code);

      return ok(undefined);
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

    /**
     * 支払い済みにする。利用者の操作ではなく、決済の結果を受けた入口（webhook）が呼ぶので、システムの印を受け取る。
     * requireAuth を通った利用者は System ではないので、利用者の route からは呼べない。
     * 何度呼んでも同じ結果になる（すでに支払い済みなら、成功として返す）。webhook は再送されるので、それに耐える
     */
    async markPaid(
      system: System,
      id: InvoiceId,
      now: Date,
    ): Promise<Result<void, typeof NotFound.code | "NOT_PAYABLE">> {
      const all = reachOf(system);

      const paid = await repo.update(all, id, { status: "paid", updatedAt: now }, "sent");
      if (paid !== null) return ok(undefined);

      // 書き換わらなかった。無いのか、もう支払い済みなのか、送付前なのか
      const found = await repo.find(all, id);
      if (found === null) return err(NotFound.code);
      if (found.invoice.status === "paid") return ok(undefined);

      return err("NOT_PAYABLE");
    },

    /** 送付する。admin だけが、下書きだけを送れる */
    async send(
      actor: Actor,
      id: InvoiceId,
      now: Date,
    ): Promise<Result<void, typeof NotFound.code | typeof Forbidden.code | typeof NotDraft.code>> {
      const reach = reachOf(actor);

      const found = await repo.find(reach, id);
      if (found === null) return err(NotFound.code);
      if (!canSend(actor)) return err(Forbidden.code);
      if (!isSendable(found.invoice)) return err(NotDraft.code);

      const sent = await repo.update(reach, id, { status: "sent", updatedAt: now }, "draft");
      // 読んだ後に、別の誰かが先に状態を変えた
      if (sent === null) return err(NotDraft.code);

      return ok(undefined);
    },

    /** 消せるのは、範囲の中で、所有者側の関係のものだけ */
    async remove(
      actor: Actor,
      id: InvoiceId,
    ): Promise<Result<void, typeof NotFound.code | typeof Forbidden.code>> {
      const reach = reachOf(actor);

      const found = await repo.find(reach, id);
      if (found === null) return err(NotFound.code);
      if (!canManage(found.access)) return err(Forbidden.code);

      const deleted = await repo.delete(reach, id);
      if (!deleted) return err(NotFound.code);

      return ok(undefined);
    },

    /**
     * 同じ組織の誰かに共有する。所有者側（所有者・admin）だけが共有できる。
     * 相手が同じ組織かは、ここでは確かめない（利用者の一覧がまだ無い）。
     * 違う組織の相手に共有しても、範囲が組織で絞るので、その人には見えない
     */
    async share(
      actor: Actor,
      id: InvoiceId,
      userId: string,
      level: ShareLevel,
    ): Promise<Result<void, typeof NotFound.code | typeof Forbidden.code>> {
      const found = await repo.find(reachOf(actor), id);
      if (found === null) return err(NotFound.code);
      if (!canManage(found.access)) return err(Forbidden.code);

      await repo.upsertShare({ invoiceId: id, userId, level });

      return ok(undefined);
    },

    /** 共有をやめる。共有できる人だけ */
    async unshare(
      actor: Actor,
      id: InvoiceId,
      userId: string,
    ): Promise<Result<void, typeof NotFound.code | typeof Forbidden.code>> {
      const found = await repo.find(reachOf(actor), id);
      if (found === null) return err(NotFound.code);
      if (!canManage(found.access)) return err(Forbidden.code);

      await repo.deleteShare(id, userId);

      return ok(undefined);
    },
  };
}

export type InvoicesService = ReturnType<typeof invoicesService>;
