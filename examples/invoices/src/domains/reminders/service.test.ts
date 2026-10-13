import { expect, it } from "vitest";
import { err, ok } from "hono-kit/result";
import { scopeTo } from "../../db";
import { remindersRepository, remindersTable } from "./repo.d1";
import { remindersService, type Mailer, type RemindableInvoice } from "./service";
import { db, insertInvoices, invoice } from "../../../test/fixtures";

const now = new Date("2026-06-10T00:00:00Z");

/** 送ったメールを覚えておく偽物。fail を true にすると 1 回だけ失敗する */
const fakeMailer = () => {
  const sent: string[] = [];
  let fail = false;
  const mailer: Mailer = {
    async send({ idempotencyKey }) {
      if (fail) {
        fail = false;
        return err("MAIL_FAILED");
      }
      sent.push(idempotencyKey);
      return ok(undefined);
    },
  };
  return { mailer, sent, failOnce: () => (fail = true) };
};

// 入口が invoices から読んで渡す、督促してよい請求書
const remindable: RemindableInvoice = {
  title: "t",
  amount: 1000,
  customerEmail: "c@example.com",
  dueAt: new Date("2026-06-01T00:00:00Z"),
};

it("同じ日に 2 回届いても、送るのは 1 回。2 回目は確定済みなので送らない", async () => {
  await insertInvoices([invoice({ id: "r1" })]);
  const { mailer, sent } = fakeMailer();
  const reminders = remindersService(remindersRepository(scopeTo(db(), remindersTable)), mailer, {
    async enqueue() {},
  });

  expect(await reminders.send({ invoiceId: "r1" }, remindable, now)).toEqual({
    ok: true,
    value: "SENT",
  });
  expect(await reminders.send({ invoiceId: "r1" }, remindable, now)).toEqual({
    ok: true,
    value: "SKIPPED",
  });
  expect(sent).toEqual(["reminder/r1/2026-06-10"]);
});

it("メールに失敗したら押さえたまま残り、再送で同じ冪等キーで送り直す", async () => {
  await insertInvoices([invoice({ id: "r2" })]);
  const { mailer, sent, failOnce } = fakeMailer();
  const reminders = remindersService(remindersRepository(scopeTo(db(), remindersTable)), mailer, {
    async enqueue() {},
  });

  failOnce();
  expect(await reminders.send({ invoiceId: "r2" }, remindable, now)).toEqual({
    ok: false,
    error: "MAIL_FAILED",
  });
  expect(await reminders.send({ invoiceId: "r2" }, remindable, now)).toEqual({
    ok: true,
    value: "SENT",
  });
  expect(sent).toEqual(["reminder/r2/2026-06-10"]);
});

it("送るべきでなくなっていたら、見送りとして残し、その日はもう送らない", async () => {
  await insertInvoices([invoice({ id: "r3" })]);
  const { mailer, sent } = fakeMailer();
  const repo = remindersRepository(scopeTo(db(), remindersTable));
  const reminders = remindersService(repo, mailer, { async enqueue() {} });

  expect(await reminders.send({ invoiceId: "r3" }, null, now)).toEqual({
    ok: true,
    value: "SKIPPED",
  });
  expect(await repo.claim({ invoiceId: "r3", sentOn: "2026-06-10" })).toBe("skipped");
  expect(sent).toEqual([]);
});
