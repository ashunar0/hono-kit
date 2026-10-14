/**
 * hono-kit/sqlite の uniqueViolationOf。D1 と libSQL の文面から、ぶつかった列を取り出せるか
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { uniqueViolationOf } from "../src/sqlite.ts";

test("libSQL の文面から列を取り出す", () => {
  const error = new Error(
    "SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: members.email",
  );
  assert.equal(uniqueViolationOf(error), "members.email");
});

test("D1 の文面から列を取り出す", () => {
  const error = new Error(
    "D1_ERROR: UNIQUE constraint failed: members.user_id: SQLITE_CONSTRAINT",
  );
  assert.equal(uniqueViolationOf(error), "members.user_id");
});

test("drizzle が包んだ error は cause をたどる", () => {
  const cause = new Error("UNIQUE constraint failed: members.email");
  const wrapped = new Error("Failed query: insert into members ...", { cause });
  assert.equal(uniqueViolationOf(wrapped), "members.email");
});

test("複数列の一意制約は列を全部返す", () => {
  const error = new Error(
    "UNIQUE constraint failed: loans.member_id, loans.book_id",
  );
  assert.equal(uniqueViolationOf(error), "loans.member_id, loans.book_id");
});

test("式のインデックスはインデックスの名前を返す", () => {
  const error = new Error(
    "UNIQUE constraint failed: index 'members_email_lower'",
  );
  assert.equal(uniqueViolationOf(error), "members_email_lower");
});

test("一意制約の違反でなければ null", () => {
  assert.equal(
    uniqueViolationOf(new Error("FOREIGN KEY constraint failed")),
    null,
  );
  assert.equal(uniqueViolationOf("not an error"), null);
});
