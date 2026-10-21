import { orgId } from "../src/domains/users/model";
import { invoiceId, reachOf } from "../src/domains/invoices/model";
import { expect, it } from "vitest";
import { scopeTo } from "../src/db";
import { invoicesService } from "../src/domains/invoices/service";
import { paymentsTable } from "../src/domains/payments/repo.d1";
import { invoicesQueries } from "../src/routes/invoices/_queries";
import { reportsQueries } from "../src/routes/reports/monthly/_queries";
import { systemActor } from "hono-kit/testing";
import { admin, admin2, alice, carol, db, insertInvoices, invoice, invoicesRepo } from "./fixtures";

const service = () => invoicesService(invoicesRepo());

const now = new Date("2026-01-15T00:00:00Z");

/** テスト同士で id が重ならないよう、prefix を付けて 2 つの組織に 1 件ずつ入れる */
const seed = (prefix: string) =>
  insertInvoices([
    invoice({ id: `${prefix}-a`, ownerId: alice.id, orgId: orgId("org1") }),
    invoice({ id: `${prefix}-c`, ownerId: carol.id, orgId: orgId("org2") }),
  ]);

it("admin が触れるのは自分の組織の請求書だけ。他の組織のものは在ることも分からない", async () => {
  await seed("t1");
  const invoices = service();

  const queries = invoicesQueries(db());

  const page = await queries.list(admin, { limit: 10 });
  expect(page.items.map((i) => i.id)).toEqual(["t1-a"]);

  expect(await queries.get(admin, invoiceId("t1-c"))).toBeNull();
  expect(await invoices.send(admin, invoiceId("t1-c"), now)).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
  expect(await invoices.remove(admin, invoiceId("t1-c"))).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
});

it("システムは全ての組織の請求書に触れる", async () => {
  await seed("t2");

  const page = await invoicesQueries(db()).list(systemActor, { limit: 100 });
  const ids = page.items.map((i) => i.id);
  expect(ids).toContain("t2-a");
  expect(ids).toContain("t2-c");
});

it("作った請求書は作った人の組織のものになる", async () => {
  const id = await service().create(
    carol,
    {
      title: "t",
      body: "b",
      customerEmail: "c@example.com",
      dueAt: new Date("2026-02-01T00:00:00Z"),
      amount: 100,
    } as never,
    now,
  );

  const found = await invoicesRepo().find(reachOf(carol), id);
  expect(found?.invoice.orgId).toBe("org2");
});

it("レポートは自分の組織の分だけ数える", async () => {
  await insertInvoices([
    invoice({
      id: "r1",
      orgId: orgId("org1"),
      status: "paid",
      amount: 1000,
      dueAt: new Date("2026-01-10T00:00:00Z"),
    }),
    invoice({
      id: "r2",
      ownerId: carol.id,
      orgId: orgId("org2"),
      status: "paid",
      amount: 7000,
      dueAt: new Date("2026-01-10T00:00:00Z"),
    }),
  ]);
  const payments = scopeTo(db(), paymentsTable);
  const paidAt = new Date("2026-01-12T00:00:00Z");
  await payments.insert({
    id: "rp1",
    invoiceId: "r1",
    amount: 1000,
    status: "succeeded",
    providerRef: "cs_r1",
    updatedAt: paidAt,
  });
  await payments.insert({
    id: "rp2",
    invoiceId: "r2",
    amount: 7000,
    status: "succeeded",
    providerRef: "cs_r2",
    updatedAt: paidAt,
  });

  const reports = reportsQueries(db());

  expect(await reports.monthly(admin, "2026-01", "2026-01")).toEqual([
    { month: "2026-01", invoiced: 1000, received: 1000 },
  ]);
  expect(await reports.monthly(admin2, "2026-01", "2026-01")).toEqual([
    { month: "2026-01", invoiced: 7000, received: 7000 },
  ]);
});
