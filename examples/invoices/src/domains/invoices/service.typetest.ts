import { invoiceId, invoiceInputSchema, reachOf } from "./model";
import { systemActor } from "hono-kit/testing";
import type { Account } from "#src/domains/accounts/model";
import { createService } from "hono-kit/service";
import type { InvoicesPorts, InvoicesService } from "./service";

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
  await invoices.write.create(actor, unchecked, now);

  // 検査を通せば渡せる
  await invoices.write.create(actor, invoiceInputSchema.parse(raw), now);

  // Result で受けたいときは safeParse
  const parsed = invoiceInputSchema.safeParse(raw);
  if (parsed.success) await invoices.write.create(actor, parsed.data, now);
}

// システムは利用者ではないので、請求書の所有者になれない
export async function systemCannotCreate(invoices: InvoicesService, raw: unknown) {
  // @ts-expect-error create が受け取るのは Account だけ
  await invoices.write.create(systemActor, invoiceInputSchema.parse(raw), new Date());
}

// 印はリテラルでは作れない。システムは systemActor、利用者は認証を通ったときだけ現れる
export async function cannotForgeActors(invoices: InvoicesService) {
  // @ts-expect-error { kind: "system" } と書いてもシステムにはなれない
  await invoices.read.listOverdue({ kind: "system" }, new Date());
  // @ts-expect-error { kind: "account", ... } と書いても利用者にはなれない
  await invoices.read.listOverdue({ kind: "account", id: "x", role: "admin" }, new Date());
}

// 請求書の ID は印付き。素の string は渡せない
export async function idsAreNotInterchangeable(invoices: InvoicesService, actor: Account) {
  // @ts-expect-error 素の string は請求書の ID ではない
  await invoices.write.remove(actor, "x");
  // @ts-expect-error 利用者の ID も請求書の ID としては渡せない
  await invoices.write.remove(actor, actor.id);

  // 印は作る関数で付ける
  await invoices.write.remove(actor, invoiceId("x"));
}

// 支払い済みにできるのはシステム（webhook）だけ。利用者の route からは呼べない
export async function usersCannotMarkPaid(invoices: InvoicesService, actor: Account) {
  // @ts-expect-error markPaid が受け取るのは System だけ
  await invoices.write.markPaid(actor, invoiceId("x"), new Date());

  await invoices.write.markPaid(systemActor, invoiceId("x"), new Date());
}

// 読みと書きは、名前ではなく、触れるもので分かれる。read は repo の read の側しか受け取らない
export const readsCannotWrite = createService({
  read: ({ repo }) => ({
    async touch(actor: Account) {
      const changes = { updatedAt: new Date() };
      // @ts-expect-error read の repo に update は無い（書くなら write に置く）
      await repo.update(reachOf(actor), invoiceId("x"), changes);
    },
  }),
  write: ({ repo }: InvoicesPorts) => ({
    async touch(actor: Account) {
      const changes = { updatedAt: new Date() };
      await repo.write.update(reachOf(actor), invoiceId("x"), changes);
    },
  }),
});

// 入口は、読みか書きかを呼ぶ場所で選ぶ。選ばずには呼べない
export async function callersChooseASide(invoices: InvoicesService, actor: Account) {
  // @ts-expect-error service の直下に手順は無い
  await invoices.send(actor, invoiceId("x"), new Date());
  // @ts-expect-error send は書き込みなので read には無い
  await invoices.read.send(actor, invoiceId("x"), new Date());
}
