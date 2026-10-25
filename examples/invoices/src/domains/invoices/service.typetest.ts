import { invoiceId, invoiceInputSchema } from "./model";
import { systemActor } from "hono-kit/testing";
import type { Account } from "#src/domains/accounts/model";
import type { InvoicesService } from "./service";

// HTTP を通らずに service を呼ぶ場面（cron、CSV の取り込みなど）
export async function fromCron(invoices: InvoicesService, actor: Account, raw: unknown, now: Date) {
  const unchecked = {
    title: "t",
    body: "b",
    amount: 1000,
    customerEmail: "a@example.com",
    dueAt: new Date(),
  };
  // @ts-expect-error 検査を通っていない値は渡せない
  await invoices.create(actor, unchecked, now);

  // 検査を通せば渡せる
  await invoices.create(actor, invoiceInputSchema.parse(raw), now);

  // Result で受けたいときは safeParse
  const parsed = invoiceInputSchema.safeParse(raw);
  if (parsed.success) await invoices.create(actor, parsed.data, now);
}

// システムは利用者ではないので、請求書の所有者になれない
export async function systemCannotCreate(invoices: InvoicesService, raw: unknown) {
  // @ts-expect-error create が受け取るのは Account だけ
  await invoices.create(systemActor, invoiceInputSchema.parse(raw), new Date());
}

// 請求書の ID は印付き。素の string は渡せない
export async function idsAreNotInterchangeable(invoices: InvoicesService, actor: Account) {
  // @ts-expect-error 素の string は請求書の ID ではない
  await invoices.remove(actor, "x");
  // @ts-expect-error 利用者の ID も請求書の ID としては渡せない
  await invoices.remove(actor, actor.id);

  // 印は作る関数で付ける
  await invoices.remove(actor, invoiceId("x"));
}

// 支払い済みにできるのはシステム（webhook）だけ。利用者の route からは呼べない
export async function usersCannotMarkPaid(invoices: InvoicesService, actor: Account) {
  // @ts-expect-error markPaid が受け取るのは System だけ
  await invoices.markPaid(actor, invoiceId("x"), new Date());

  await invoices.markPaid(systemActor, invoiceId("x"), new Date());
}
