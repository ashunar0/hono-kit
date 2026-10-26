/**
 * Failure data. It knows no HTTP status, so code that is not HTTP (cron, queues, the app's own rules) may import it too.
 * The three that mean the same everywhere (401, 403, 404) are the standards kept here.
 * The app writes its own as `{ code, kind, message } as const`, wherever it keeps its rules
 */

/** Failure kinds. failure.ts alone maps them to HTTP statuses */
export type FailureKind =
  | "unauthenticated"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "unprocessable"
  | "upstream";

/**
 * A failure owned by the thing (model): a code, a kind and a default message. It knows no HTTP status.
 * `export const NotDraft = { code: "NOT_DRAFT", kind: "conflict", message: "…" } as const;`
 */
export type Failure<
  K extends string = string,
  Kind extends FailureKind = FailureKind,
> = {
  readonly code: K;
  readonly kind: Kind;
  readonly message: string;
};

export const Unauthorized = {
  code: "UNAUTHORIZED",
  kind: "unauthenticated",
  message: "Authentication required",
} as const;

export const NotFound = {
  code: "NOT_FOUND",
  kind: "notFound",
  message: "Not found",
} as const;

export const Forbidden = {
  code: "FORBIDDEN",
  kind: "forbidden",
  message: "This operation is not allowed",
} as const;
