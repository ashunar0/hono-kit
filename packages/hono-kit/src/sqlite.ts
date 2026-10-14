/**
 * Helpers for SQLite databases (Cloudflare D1, libSQL, better-sqlite3): they all report errors in SQLite's words.
 * Another database gets its own entry (hono-kit/postgres, ...), as drizzle splits sqlite-core and pg-core
 */

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
