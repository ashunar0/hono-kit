import { eq } from "drizzle-orm";
import { updateWithVersion } from "hono-kit/sqlite";
import { expect, expectTypeOf, it } from "vitest";
import { draftsTable, seatsTable, shelvesTable } from "#/db/schema";
import { db } from "./fixtures";

it("updateWithVersion: updates while the version is the one read, and counts it up", async () => {
  const id = crypto.randomUUID();
  await db().insert(draftsTable).values({ id, body: "a", version: 1 });

  const [row] = await updateWithVersion(db(), draftsTable, { id, version: 1 }, { body: "b" });

  expect(row).toEqual({ id, body: "b", version: 2 });
});

it("updateWithVersion: a stale version changes nothing and returns undefined", async () => {
  const id = crypto.randomUUID();
  await db().insert(draftsTable).values({ id, body: "a", version: 1 });
  // Two clients read version 1; the first saves
  await updateWithVersion(db(), draftsTable, { id, version: 1 }, { body: "first" });

  const [second] = await updateWithVersion(db(), draftsTable, { id, version: 1 }, { body: "second" });

  expect(second).toBeUndefined();
  const [row] = await db().select().from(draftsTable).where(eq(draftsTable.id, id));
  expect(row).toMatchObject({ body: "first", version: 2 });
});

it("updateWithVersion: it is a query, so it can go in a batch", async () => {
  const id = crypto.randomUUID();
  await db().insert(draftsTable).values({ id, body: "a", version: 1 });

  const [rows] = await db().batch([
    updateWithVersion(db(), draftsTable, { id, version: 1 }, { body: "batched" }),
  ]);

  expect(rows).toEqual([{ id, body: "batched", version: 2 }]);
  // In a batch the rows are the table's too, as when awaited
  expectTypeOf(rows).toEqualTypeOf<(typeof draftsTable.$inferSelect)[]>();
});

it("updateWithVersion: a table without a version column does not type-check", () => {
  const plain = { id: draftsTable.id } as const;
  // @ts-expect-error the table needs a version column
  void (() => updateWithVersion(db(), plain, { id: "x", version: 1 }, {}));
});

it("updateWithVersion: names the row by the primary key, whatever its name", async () => {
  const bookId = crypto.randomUUID();
  await db().insert(shelvesTable).values({ bookId, count: 5, version: 0 });

  const [row] = await updateWithVersion(db(), shelvesTable, { bookId, version: 0 }, { count: 8 });
  const [stale] = await updateWithVersion(db(), shelvesTable, { bookId, version: 0 }, { count: 6 });

  expect(row).toEqual({ bookId, count: 8, version: 1 });
  expect(stale).toBeUndefined();
});

it("updateWithVersion: a column that is not the primary key, or a key over two columns, does not type-check", () => {
  // @ts-expect-error id is not this table's primary key
  void (() => updateWithVersion(db(), shelvesTable, { id: "x", version: 0 }, {}));
  // @ts-expect-error body is not the primary key
  void (() => updateWithVersion(db(), draftsTable, { body: "x", version: 0 }, {}));
  // @ts-expect-error the key spans two columns
  void (() => updateWithVersion(db(), seatsTable, { roomId: "r", version: 0 }, {}));
});
