import { invoiceId, reachOf } from "./model";
import type { Account } from "#src/domains/accounts/model";
import type { InvoicesReader, InvoicesReads } from "./reader";

// 印はリテラルでは作れない。システムは systemActor、利用者は認証を通ったときだけ現れる
export async function cannotForgeActors(invoicesReader: InvoicesReader) {
  // @ts-expect-error { kind: "system" } と書いてもシステムにはなれない
  await invoicesReader.listOverdue({ kind: "system" }, new Date());
  // @ts-expect-error { kind: "account", ... } と書いても利用者にはなれない
  await invoicesReader.listOverdue({ kind: "account", id: "x", role: "admin" }, new Date());
}

// 読みが受け取るのは保存の形の読みの部分だけ。名前に関係なく、書く method はここに無い
export async function readsCannotWrite(repo: InvoicesReads, actor: Account) {
  await repo.find(reachOf(actor), invoiceId("x"));
  // @ts-expect-error update は書き込みなので、読みの部分に無い（書くなら service に置く）
  await repo.update(reachOf(actor), invoiceId("x"), {});
}
