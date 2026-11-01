/**
 * Logs a throw nobody handled as one JSON line: { level, kind, ...where, error }.
 * `where` says what was running (the route, the queue message), so the logs can be filtered by it
 */
export const logUnhandled = (where: Record<string, unknown>, error: unknown) =>
  console.error(
    JSON.stringify({
      level: "error",
      kind: "unhandled",
      ...where,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    }),
  );
