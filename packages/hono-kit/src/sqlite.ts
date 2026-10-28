/**
 * Helpers for SQLite databases (Cloudflare D1, libSQL, better-sqlite3): they all report errors in SQLite's words.
 * Another database gets its own entry (hono-kit/postgres, ...), as drizzle splits sqlite-core and pg-core.
 * The one file that imports drizzle-orm: it is a peer dependency, so the app's own drizzle is used
 */
import { and, eq, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * The column a unique constraint violation hit ("members.email"), or null when the error is not one.
 * drizzle may wrap the error, so it follows cause. Use it in the catch of a repo insert / update:
 * return a failure value per column, rethrow when it is null.
 * For a unique index over several columns, SQLite names them all ("loans.member_id, loans.book_id").
 * For an index on an expression it names the index instead, and this returns that name ("members_email_lower")
 */
export const uniqueViolationOf = (error: unknown): string | null => {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const match =
      /UNIQUE constraint failed: (?:index '([^']+)'|([\w.]+(?:, [\w.]+)*))/.exec(
        e.message,
      );
    if (match) return match[1] ?? match[2] ?? null;
  }

  return null;
};

/**
 * What updateWithVersion takes, by shape only. drizzle's classes have private fields, so a db or table made by
 * another copy of drizzle (a linked hono-kit) would not match them as classes. D1, libSQL and better-sqlite3 all fit
 */
type UpdatingDb = {
  update(table: any): {
    set(values: any): { where(condition: any): { returning(): PromiseLike<unknown> } };
  };
};

/** A drizzle table with an `id` column and a whole-number `version` column, the one counted up */
type VersionedTable = {
  id: unknown;
  version: unknown;
  $inferSelect: { id: unknown; version: number };
  $inferInsert: object;
};

/**
 * Optimistic locking: updates the row only while its version is still the one read, and counts it up.
 * Returns the updated row, or undefined when no row matched: someone changed it in between, or there is no such row.
 * Tell those apart before calling it (read the row first and answer NOT_FOUND), so undefined here means a conflict.
 * The version is whatever the client read (a form keeps it, as Rails' lock_version), not one read again here
 */
export const updateWithVersion = async <T extends VersionedTable>(
  db: UpdatingDb,
  table: T,
  at: { id: T["$inferSelect"]["id"]; version: number },
  set: Partial<Omit<T["$inferInsert"], "id" | "version">>,
): Promise<T["$inferSelect"] | undefined> => {
  const id = table.id as SQLiteColumn;
  const version = table.version as SQLiteColumn;
  const rows = await db
    .update(table)
    .set({ ...set, version: sql`${version} + 1` })
    .where(and(eq(id, at.id), eq(version, at.version)))
    .returning();

  // returning() on SQLite gives the updated rows of the table
  return (rows as T["$inferSelect"][])[0];
};
