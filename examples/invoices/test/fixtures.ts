import { env } from "cloudflare:workers";
import { scopeTo, wireDb } from "#src/db/index";
import { invoiceId, type Invoice } from "#src/domains/invoices/model";
import {
  invoicesRepository,
  invoiceSharesTable,
  invoicesTable,
} from "#src/domains/invoices/repo.d1";
import { makeDeps } from "#src/deps";
import { buildApp } from "#src/index";
import { authenticatedAccount, orgId, accountId, type Account } from "#src/domains/accounts/model";

export const db = () => wireDb(env.DB);

/** 本物の D1 に繋いだ invoices の repo */
export const invoicesRepo = () =>
  invoicesRepository({
    scope: scopeTo(db(), invoicesTable),
    shares: scopeTo(db(), invoiceSharesTable),
  });

export const alice = authenticatedAccount(accountId("alice"), orgId("org1"), "member");
export const bob = authenticatedAccount(accountId("bob"), orgId("org1"), "member");
export const admin = authenticatedAccount(accountId("admin"), orgId("org1"), "admin");
/** 別の組織の人たち */
export const carol = authenticatedAccount(accountId("carol"), orgId("org2"), "member");
export const admin2 = authenticatedAccount(accountId("admin2"), orgId("org2"), "admin");

/** 請求書を 1 件。テストで気にしない項目は既定値で埋める */
export const invoice = (over: Omit<Partial<Invoice>, "id"> & { id: string }): Invoice => ({
  orgId: alice.orgId,
  ownerId: alice.id,
  title: `title ${over.id}`,
  body: "body",
  amount: 1000,
  customerEmail: "customer@example.com",
  dueAt: new Date("2026-01-31T00:00:00Z"),
  status: "draft",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
  id: invoiceId(over.id),
});

export const insertInvoices = async (invoices: Invoice[]) => {
  await scopeTo(db(), invoicesTable).insert(invoices[0]!);
  for (const row of invoices.slice(1)) await scopeTo(db(), invoicesTable).insert(row);
};

/**
 * この利用者としてログインした状態のアプリ（本物の deps と D1）。
 * null ならログインしていない。認証の提供元の代わりにセッションの user を積むだけで、あとは本番と同じ
 */
export const appAs = (account: Account | null, at?: Date) =>
  buildApp(
    makeDeps,
    async (c, next) => {
      c.set("account", account);
      await next();
    },
    at ? () => at : undefined,
  );

/** appAs で JSON を送る。env は本物の D1 を指す */
export const request = (
  account: Account | null,
  method: string,
  path: string,
  body?: unknown,
  at?: Date,
) =>
  appAs(account, at).request(
    path,
    {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
