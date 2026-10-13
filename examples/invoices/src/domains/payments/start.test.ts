import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { err, ok } from "hono-kit/result";
import { scopeTo } from "../../db";
import { paymentsRepository, paymentsTable } from "./repo.d1";
import { paymentsService, type PayableInvoice, type PaymentGateway } from "./service";
import { db, insertInvoices, invoice } from "../../../test/fixtures";

const now = new Date("2026-01-15T00:00:00Z");

// 入口が invoices から読んで渡す、支払える請求書
const payable = (id: string): PayableInvoice => ({ id, title: "t", amount: 1200 });

const gateway = (works: boolean): PaymentGateway => ({
  async createCheckout({ paymentId }) {
    return works
      ? ok({ checkoutUrl: `https://checkout.test/${paymentId}`, providerRef: `cs_${paymentId}` })
      : err("GATEWAY_FAILED");
  },
  async verifyEvent() {
    return ok(null);
  },
});

const paymentsOf = (invoiceId: string) =>
  db().select().from(paymentsTable).where(eq(paymentsTable.invoiceId, invoiceId));

it("先に pending を記録し、決済画面を作れたら識別子を結びつける", async () => {
  await insertInvoices([invoice({ id: "pay1", status: "sent" })]);
  const payments = paymentsService(paymentsRepository(scopeTo(db(), paymentsTable)), gateway(true));

  const result = await payments.start(payable("pay1"), now);

  expect(result.ok).toBe(true);
  const [row] = await paymentsOf("pay1");
  expect(row).toMatchObject({ status: "pending", providerRef: `cs_${row!.id}`, amount: 1200 });
});

it("決済画面を作れなかったら、記録した支払いを失敗で閉じる", async () => {
  await insertInvoices([invoice({ id: "pay2", status: "sent" })]);
  const payments = paymentsService(
    paymentsRepository(scopeTo(db(), paymentsTable)),
    gateway(false),
  );

  expect(await payments.start(payable("pay2"), now)).toEqual({
    ok: false,
    error: "GATEWAY_FAILED",
  });
  const rows = await paymentsOf("pay2");
  expect(rows.map((r) => [r.status, r.providerRef])).toEqual([["failed", null]]);
});

it("同じ請求書で 2 回始めても、進行中の支払いは 1 つで、同じ決済画面を返す", async () => {
  await insertInvoices([invoice({ id: "pay3", status: "sent" })]);
  const payments = paymentsService(paymentsRepository(scopeTo(db(), paymentsTable)), gateway(true));

  const first = await payments.start(payable("pay3"), now);
  const second = await payments.start(payable("pay3"), now);

  expect(first.ok && second.ok).toBe(true);
  if (first.ok && second.ok) expect(second.value.checkoutUrl).toBe(first.value.checkoutUrl);
  expect((await paymentsOf("pay3")).filter((r) => r.status === "pending")).toHaveLength(1);
});
