/**
 * A type for returning expected failures as values.
 *
 * You must narrow on ok before reading value, so failure handling cannot be skipped.
 * List the possible failures in E. Unexpected failures (the DB is down, ...) are still thrown
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T) => ({ ok: true, value }) as const;

export const err = <E>(error: E) => ({ ok: false, error }) as const;
