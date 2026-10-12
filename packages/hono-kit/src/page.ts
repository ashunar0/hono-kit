/**
 * List pagination (keyset). Order is "time + id", and the next page is pointed to by a position (Cursor).
 * A list always takes a PageQuery and returns a Page, leaving no way to write an unbounded list.
 * Types and pure functions only. HTTP input/output shapes live in page-schema.ts
 */

/** A position in a list: the ordering time and id. Unique by id even when times collide */
export type Cursor = { at: Date; id: string };

/** List conditions. limit is required, capped at PAGE_LIMIT.max */
export type PageQuery = {
  /** Start after this position */
  after?: Cursor;
  limit: number;
};

/** One page of a list. next is null when there is no more */
export type Page<T> = {
  items: T[];
  next: Cursor | null;
};

export const PAGE_LIMIT = { default: 20, max: 100 } as const;

/**
 * Builds a page from rows read with "limit + 1".
 * The extra row tells whether there is more. The repo reads with `.limit(limit + 1)` and passes the rows here
 */
export const toPage = <T>(
  rows: T[],
  limit: number,
  cursorOf: (item: T) => Cursor,
): Page<T> => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);

  return { items, next: rows.length > limit && last ? cursorOf(last) : null };
};
