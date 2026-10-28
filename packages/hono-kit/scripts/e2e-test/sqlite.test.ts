import { eq } from "drizzle-orm";
import { updateWithVersion } from "hono-kit/sqlite";
import { expect, it } from "vitest";
import { draftsTable } from "#src/db/schema";
import { db } from "./fixtures";

it("updateWithVersion: updates while the version is the one read, and counts it up", async () => {
  const id = crypto.randomUUID();
  await db().insert(draftsTable).values({ id, body: "a", version: 1 });

  const row = await updateWithVersion(db(), draftsTable, { id, version: 1 }, { body: "b" });

  expect(row).toEqual({ id, body: "b", version: 2 });
});

it("updateWithVersion: a stale version changes nothing and returns undefined", async () => {
  const id = crypto.randomUUID();
  await db().insert(draftsTable).values({ id, body: "a", version: 1 });
  // Two clients read version 1; the first saves
  await updateWithVersion(db(), draftsTable, { id, version: 1 }, { body: "first" });

  const second = await updateWithVersion(db(), draftsTable, { id, version: 1 }, { body: "second" });

  expect(second).toBeUndefined();
  const [row] = await db().select().from(draftsTable).where(eq(draftsTable.id, id));
  expect(row).toMatchObject({ body: "first", version: 2 });
});

it("updateWithVersion: a table without a version column does not type-check", () => {
  const plain = { id: draftsTable.id } as const;
  // @ts-expect-error the table needs a version column
  void (() => updateWithVersion(db(), plain, { id: "x", version: 1 }, {}));
});
