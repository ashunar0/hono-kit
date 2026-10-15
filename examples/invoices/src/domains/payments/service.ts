/**
 * 支払いの手順（How）。請求書を確かめ、決済サービスの画面を作り、支払いを記録する
 */
import { err, ok, type Result } from "hono-kit/result";
import { NotFound } from "hono-kit/failures";
import type { System } from "hono-kit/system";
import { GatewayFailed, isStale, PaymentStarting, type Payment, type PaymentEvent } from "./model";

/** 手順が必要とする保存の形。repo.d1.ts が満たす */
export type PaymentsRepository = {
  /**
   * 進行中の支払いを記録する。その請求書に進行中のものがすでにあれば何もせず null を返す
   * （DB の部分ユニーク索引が、同時に 2 つ記録されるのを止める）
   */
  insertPending(payment: Omit<Payment, "status">): Promise<Payment | null>;
  /** その請求書の、進行中の支払い */
  findPending(invoiceId: string): Promise<Payment | null>;
  /** 決済サービスの画面を作れたら、その識別子と URL を結びつける */
  attachCheckout(
    id: string,
    checkout: { providerRef: string; checkoutUrl: string },
    now: Date,
  ): Promise<void>;
  /** 画面を作れなかった支払いを、失敗で閉じる */
  markFailed(id: string, now: Date): Promise<void>;
  /** 決済サービス側の識別子で状態を書き換える。無ければ null */
  updateStatusByProviderRef(
    providerRef: string,
    status: Payment["status"],
    now: Date,
  ): Promise<Payment | null>;
};

/**
 * 手順が必要とする決済サービスの形。gateway.stripe.ts が満たす。
 * 決済サービスの都合（API の形、認証、エラーの種類）はここに出さない
 */
export type PaymentGateway = {
  /** 支払い画面を作る。利用者を checkoutUrl に送る。同じ paymentId なら、決済サービスが 1 回にまとめる */
  createCheckout(input: {
    paymentId: string;
    amount: number;
    description: string;
  }): Promise<Result<{ checkoutUrl: string; providerRef: string }, typeof GatewayFailed.code>>;
  /** 届いた通知が本物か確かめ、支払いの結果として読む。支払いに関係ない通知は null */
  verifyEvent(
    payload: string,
    signature: string,
  ): Promise<Result<PaymentEvent | null, "INVALID_SIGNATURE">>;
};

/**
 * 支払う請求書。入口（handler）が invoices の service から読み、値で渡す。
 * 支払えるか（送付済みか、範囲の中か）は、渡す前に invoices が確かめている。payments は invoices を知らない
 */
export type PayableInvoice = { id: string; title: string; amount: number };

/** 引数の順番は、誰として（actor）→ 何を → どうする → いつ（now）。時計は読まない */
export function paymentsService(repo: PaymentsRepository, gateway: PaymentGateway) {
  return {
    /** 支払いを始める。請求書は、入口が invoices から読んだ支払えるもの。返すのは、支払いの ID と、利用者を送る先 */
    async start(
      invoice: PayableInvoice,
      now: Date,
    ): Promise<
      Result<
        { paymentId: string; checkoutUrl: string },
        typeof GatewayFailed.code | typeof PaymentStarting.code
      >
    > {
      const invoiceId = invoice.id;

      // 1 つの請求書に進行中の支払いは 1 つ。2 回目は、1 回目の決済画面をそのまま返す
      const existing = await repo.findPending(invoiceId);
      if (existing !== null) {
        if (existing.checkoutUrl !== null)
          return ok({ paymentId: existing.id, checkoutUrl: existing.checkoutUrl });
        // 画面を作っている途中。ただし長く止まっているものは、途中で落ちたとみなして閉じ、作り直す
        if (!isStale(existing, now)) return err(PaymentStarting.code);
        await repo.markFailed(existing.id, now);
      }

      // 先に記録 → 外へ → 結果で確定。外に出る前に記録があるので、何が起きたかを後から辿れる。
      // 業務の判断: 画面を作った直後に落ちると、画面の無い pending が残る（欠けてもよい）。
      // 利用者はまだ画面を受け取っていないので、しばらくして始め直せば、古いものを閉じて新しく作る
      const payment = await repo.insertPending({
        id: crypto.randomUUID(),
        invoiceId,
        amount: invoice.amount,
        providerRef: null,
        checkoutUrl: null,
        createdAt: now,
        updatedAt: now,
      });
      // 同時に始めた別のリクエストが、先に記録した
      if (payment === null) return err(PaymentStarting.code);

      const checkout = await gateway.createCheckout({
        paymentId: payment.id,
        amount: payment.amount,
        description: invoice.title,
      });
      if (!checkout.ok) {
        await repo.markFailed(payment.id, now);
        return checkout;
      }

      await repo.attachCheckout(payment.id, checkout.value, now);

      return ok({ paymentId: payment.id, checkoutUrl: checkout.value.checkoutUrl });
    },

    /** 届いた通知を確かめる */
    async verifyEvent(payload: string, signature: string) {
      return gateway.verifyEvent(payload, signature);
    },

    /**
     * 決済サービスから届いた結果を、支払いに反映する。何度やっても同じ結果になる。
     * 請求書を支払い済みにするのは、この後に入口（webhook）が invoices を呼んで行う。
     * 入口が次にすることを決められるよう、反映した結果（status）と請求書の ID だけを返す
     */
    // system は使わないが、受け取ることで利用者の route からは呼べなくなる
    async receive(
      _system: System,
      event: PaymentEvent,
      now: Date,
    ): Promise<Result<Pick<Payment, "status" | "invoiceId">, typeof NotFound.code>> {
      const status = event.kind === "failed" ? "failed" : "succeeded";
      const payment = await repo.updateStatusByProviderRef(event.providerRef, status, now);
      if (payment === null) return err(NotFound.code);

      return ok({ status: payment.status, invoiceId: payment.invoiceId });
    },
  };
}

export type PaymentsService = ReturnType<typeof paymentsService>;
