/**
 * HTTP input/output shapes for list pagination. To stay independent of schema libraries,
 * it implements Standard Schema by hand (hnkSchema). Filters and item shapes wrap the app's schemas (zod, valibot, ...)
 */
import { PAGE_LIMIT, type Cursor, type Page } from "./page.js";
import {
  hnkSchema,
  issue,
  toJsonSchema,
  type InferInput,
  type InferOutput,
  type StandardSchema,
} from "./standard-schema.js";

/** Encodes a position as a string that is opaque from outside */
const encodeCursor = (cursor: Cursor) =>
  btoa(`${cursor.at.getTime()}:${cursor.id}`);

/** Decodes a position from a string. null if malformed */
const decodeCursor = (value: string): Cursor | null => {
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    return null;
  }
  const at = decoded.indexOf(":");
  const ms = Number(decoded.slice(0, at));
  const id = decoded.slice(at + 1);
  if (at < 0 || !Number.isInteger(ms) || id === "") return null;

  return { at: new Date(ms), id };
};

/** A query value. Hono passes an array when a name repeats */
type QueryValue = string | string[] | undefined;

/** The pagination part: what is received (query strings) and what reaches the handler */
type PageQueryInput = { cursor?: string; limit?: string };
type PageQueryOutput = { cursor?: Cursor; limit: number };

const LIMIT_MESSAGE = `limit must be an integer from 1 to ${PAGE_LIMIT.max}`;

/**
 * The list query. Wraps the filter schema and adds cursor and limit.
 * `request: { query: pageQuerySchema(z.object({ status: ... })) }`, or `pageQuerySchema()` without filters.
 * limit has a default (20) and a cap (100), so the list is never unbounded
 */
export function pageQuerySchema(): StandardSchema<
  PageQueryInput,
  PageQueryOutput
>;
export function pageQuerySchema<F extends StandardSchema<any, any>>(
  filters: F,
): StandardSchema<
  InferInput<F> & PageQueryInput,
  InferOutput<F> & PageQueryOutput
>;
export function pageQuerySchema(
  filters?: StandardSchema<any, any>,
): StandardSchema<any, any> {
  return hnkSchema<unknown, Record<string, unknown> & PageQueryOutput>(
    async (value) => {
      const { cursor, limit, ...rest } = (value ?? {}) as Record<
        string,
        QueryValue
      >;

      const after =
        cursor === undefined
          ? undefined
          : typeof cursor === "string"
            ? decodeCursor(cursor)
            : null;
      if (after === null) return issue("Invalid cursor");

      const count = limit === undefined ? PAGE_LIMIT.default : Number(limit);
      if (
        typeof limit === "object" ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > PAGE_LIMIT.max
      )
        return issue(LIMIT_MESSAGE);

      const filtered = filters
        ? await filters["~standard"].validate(rest)
        : { value: {} };
      if (filtered.issues) return filtered;

      return {
        value: { ...filtered.value, cursor: after, limit: count },
      };
    },
    (io, options) => {
      const base = filters
        ? toJsonSchema(filters, io, options)
        : { type: "object", properties: {} };

      return {
        ...base,
        properties: {
          ...(base.properties as Record<string, unknown>),
          cursor: {
            type: "string",
            description: "Where to continue from: nextCursor of the previous response",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: PAGE_LIMIT.max,
            default: PAGE_LIMIT.default,
          },
        },
      };
    },
  );
}

type PageBody<T> = { items: T[]; nextCursor: string | null };

/** The list response shape `{ items, nextCursor }`. The item shape is the app's schema. Also caps items */
export const pageResponseSchema = <T extends StandardSchema<any, any>>(
  item: T,
) =>
  hnkSchema<PageBody<InferInput<T>>, PageBody<InferOutput<T>>>(
    async (value) => {
      const { items, nextCursor } = (value ?? {}) as Partial<PageBody<unknown>>;
      if (!Array.isArray(items) || items.length > PAGE_LIMIT.max)
        return issue(`items must be an array of at most ${PAGE_LIMIT.max} entries`);
      if (nextCursor !== null && typeof nextCursor !== "string")
        return issue("nextCursor must be a string or null");

      const checked: InferOutput<T>[] = [];
      for (const each of items) {
        const result = await item["~standard"].validate(each);
        if (result.issues) return result;
        checked.push(result.value);
      }

      return { value: { items: checked, nextCursor } };
    },
    (io, options) => ({
      type: "object",
      properties: {
        items: {
          type: "array",
          maxItems: PAGE_LIMIT.max,
          items: toJsonSchema(item, io, options),
        },
        /** Pass as cursor to read more. null when there is no more */
        nextCursor: { type: ["string", "null"] },
      },
      required: ["items", "nextCursor"],
    }),
  );

/** Page → response. map turns items into what is shown */
export const pageResponse = <T, R>(
  page: Page<T>,
  map: (item: T) => R,
): PageBody<R> => ({
  items: page.items.map(map),
  nextCursor: page.next ? encodeCursor(page.next) : null,
});
