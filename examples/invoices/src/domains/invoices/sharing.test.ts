import { invoiceId, reachOf } from "./model";
import { expect, it } from "vitest";
import { invoicesWithin } from "./repo.d1";
import { invoicesService } from "./service";
import { authenticatedAccount, orgId, type Actor } from "#src/domains/accounts/model";
import {
  admin,
  alice,
  bob,
  carol,
  db,
  insertInvoices,
  invoice,
  invoicesRepo,
} from "../../../test/fixtures";

const service = () => invoicesService({ repo: invoicesRepo() });

const now = new Date("2026-01-15T00:00:00Z");

const input = {
  title: "新しいタイトル",
  body: "b",
  customerEmail: "c@example.com",
  dueAt: new Date("2026-02-01T00:00:00Z"),
  amount: 100,
} as never;

/** alice の請求書 1 件を、テストごとに別の id で入れる */
const seed = (id: string) =>
  insertInvoices([invoice({ id, ownerId: alice.id, orgId: orgId("org1") })]);

/** その人に見える請求書の id。見えるかどうかは invoices の窓口が決める */
const ids = async (actor: Actor) =>
  (await db().select().from(invoicesWithin(db(), actor))).map((i) => i.id as string);

const sees = async (actor: Actor, id: string) => (await ids(actor)).includes(id);

it("共有されていなければ、同じ組織の member にも見えない", async () => {
  await seed("s1");

  expect(await sees(bob, "s1")).toBe(false);
  expect(await ids(bob)).not.toContain("s1");
});

it("閲覧を共有された人は、見られるが、書き換えも削除も共有もできない", async () => {
  await seed("s2");
  expect(await service().write.share(alice, invoiceId("s2"), bob.id, "view")).toEqual({
    ok: true,
    value: undefined,
  });

  expect(await sees(bob, "s2")).toBe(true);
  expect(await ids(bob)).toContain("s2");
  expect(await service().write.update(bob, invoiceId("s2"), input, now)).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });
  expect(await service().write.remove(bob, invoiceId("s2"))).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });
  expect(await service().write.share(bob, invoiceId("s2"), "dave", "view")).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });
});

it("編集を共有された人は、書き換えられるが、削除と共有はできない", async () => {
  await seed("s3");
  await service().write.share(alice, invoiceId("s3"), bob.id, "edit");

  expect((await service().write.update(bob, invoiceId("s3"), input, now)).ok).toBe(true);
  const found = await invoicesRepo().read.find(reachOf(bob), invoiceId("s3"));
  expect(found?.invoice.title).toBe("新しいタイトル");
  expect(await service().write.remove(bob, invoiceId("s3"))).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });
});

it("共有の権限は置き換えられ、やめると見えなくなる", async () => {
  await seed("s4");
  await service().write.share(alice, invoiceId("s4"), bob.id, "edit");
  await service().write.share(alice, invoiceId("s4"), bob.id, "view");
  expect(await service().write.update(bob, invoiceId("s4"), input, now)).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });

  await service().write.unshare(alice, invoiceId("s4"), bob.id);
  expect(await sees(bob, "s4")).toBe(false);
});

it("共有できるのは所有者と組織の admin。見えない人には在ることも分からない", async () => {
  await seed("s5");

  expect(await service().write.share(bob, invoiceId("s5"), "dave", "view")).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
  expect(await service().write.share(admin, invoiceId("s5"), bob.id, "view")).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await sees(bob, "s5")).toBe(true);
});

it("違う組織の人に共有しても、その人には見えない", async () => {
  await seed("s6");
  await service().write.share(alice, invoiceId("s6"), carol.id, "edit");

  expect(await sees(carol, "s6")).toBe(false);
  expect(await service().write.update(carol, invoiceId("s6"), input, now)).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
  // 同じ id の人が組織を移っても、組織の線は越えない
  const carolInOrg1 = authenticatedAccount(carol.id, orgId("org1"), "member");
  expect(await sees(carolInOrg1, "s6")).toBe(true);
});

it("所有者は共有されていなくても、自分のものを自由に扱える", async () => {
  await seed("s7");

  expect((await service().write.update(alice, invoiceId("s7"), input, now)).ok).toBe(true);
  expect((await service().write.remove(alice, invoiceId("s7"))).ok).toBe(true);
});
