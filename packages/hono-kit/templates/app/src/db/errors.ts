/**
 * Whether this is a unique constraint violation. drizzle may wrap the error, so follow cause to find D1's text.
 * Use it in the catch of a repo insert / update: return a failure value on a violation, rethrow otherwise
 */
export const isUniqueViolation = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes("UNIQUE constraint failed")) return true;
  }

  return false;
};
