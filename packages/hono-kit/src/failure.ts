import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { errorPageFor } from "./error-page.js";
import type { Failure, FailureKind } from "./failures.js";
import {
  hnkSchema,
  issue,
  type StandardIssue,
  type StandardSchema,
} from "./standard-schema.js";

/** One failure returned over HTTP. Has a code, a status and a default message */
export type HttpError<
  K extends string = string,
  S extends ContentfulStatusCode = ContentfulStatusCode,
> = {
  readonly code: K;
  readonly status: S;
  readonly message: string;
};

/** A failure as the route keeps it: with the shape of its details, when it declares them */
export type DeclaredError = HttpError & {
  readonly details?: StandardSchema<any, any>;
};

/**
 * Maps failure kinds to HTTP statuses. Only this one place holds it (same idea as Go's errors.go or gRPC status codes).
 * Add a kind only when a failure appears that none of the existing ones can express
 */
const FAILURE_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  unprocessable: 422,
  upstream: 502,
} as const satisfies Record<FailureKind, ContentfulStatusCode>;

/** Failures errorResponses accepts. A Failure gets its status from its kind; an HttpError carries its own */
export type AnyFailure = Failure | HttpError;

/** Turns a Failure into an HttpError with the status of its kind. An HttpError is returned as is */
export type ToHttpError<F extends AnyFailure> =
  F extends Failure<infer K, infer Kind>
    ? HttpError<K, (typeof FAILURE_STATUS)[Kind]> &
        (F extends { details: infer D extends StandardSchema<any, any> }
          ? { readonly details: D }
          : unknown)
    : F;

export const toHttpError = <const F extends AnyFailure>(
  failure: F,
): ToHttpError<F> =>
  ("status" in failure
    ? failure
    : {
        ...httpError(
          failure.code,
          FAILURE_STATUS[failure.kind],
          failure.message,
        ),
        ...(failure.details && { details: failure.details }),
      }) as ToHttpError<F>;

/** `export const NotFound = httpError("NOT_FOUND", 404, "Not found");` */
export const httpError = <
  const K extends string,
  const S extends ContentfulStatusCode,
>(
  code: K,
  status: S,
  message: string,
): HttpError<K, S> => ({ code, status, message });

/** When the client accepts none of the formats a route declares. Added automatically to such routes */
export const NotAcceptable = httpError(
  "NOT_ACCEPTABLE",
  406,
  "None of the accepted formats can be returned",
);

/** What was wrong with each field, by its name: `{ amount: ["Too small"], "items.0.name": ["Required"] }` (as in Laravel or Rails) */
export type FieldErrors = Record<string, string[]>;

const fieldErrorsSchema = hnkSchema<FieldErrors, FieldErrors>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) &&
        messages.every((m) => typeof m === "string"),
    )
      ? { value: value as FieldErrors }
      : issue("details must map each field to its messages"),
  () => ({
    type: "object",
    additionalProperties: { type: "array", items: { type: "string" } },
  }),
);

/**
 * When input validation fails. Used by createEndpoint.
 * details names each field that was wrong, with every reason; a problem with the input as a whole
 * (not JSON, not an object) is the message, with no fields
 */
export const ValidationError: HttpError<"VALIDATION_ERROR", 400> & {
  readonly details: typeof fieldErrorsSchema;
} = {
  ...httpError("VALIDATION_ERROR", 400, "Invalid request"),
  details: fieldErrorsSchema,
};

/** The field a problem belongs to, its path joined with "." (`items.0.name`). "" for the input as a whole */
const fieldOf = (path: StandardIssue["path"] = []) =>
  path
    .map((segment) =>
      String(typeof segment === "object" ? segment.key : segment),
    )
    .join(".");

/** A failure hono-kit raised itself (as opposed to one Hono or the app threw) */
export class HnkError extends HTTPException {
  constructor(
    readonly code: string,
    status: ContentfulStatusCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(status, { message });
  }
}

/** The ValidationError for these problems: every field's reasons in details */
export const invalid = (issues: readonly StandardIssue[]) => {
  const fields: FieldErrors = {};
  let whole: string | undefined;
  for (const { message, path } of issues) {
    const field = fieldOf(path);
    if (field === "") whole ??= message;
    else (fields[field] ??= []).push(message);
  }
  return new HnkError(
    ValidationError.code,
    ValidationError.status,
    whole ?? ValidationError.message,
    fields,
  );
};

/**
 * Creates a failure raised at the HTTP entry point. Outside handlers, e.g. in middleware: `throw fail(Unauthorized)`.
 * A failure that declares details is returned with them through reply.failure, never thrown
 */
export const fail = (
  failure: (HttpError | Failure) & { readonly details?: undefined },
  message = failure.message,
) => {
  const error = toHttpError(failure);

  return new HnkError(error.code, error.status, message);
};

export const errorBody = (code: string, message: string, details?: unknown) => ({
  error: details === undefined ? { code, message } : { code, message, details },
});

/** The single exit for every failure. `app.onError(onError)` */
export const onError: ErrorHandler = async (error, c) => {
  const shown =
    error instanceof HnkError
      ? {
          code: error.code,
          status: error.status,
          message: error.message,
          details: error.details,
        }
      : error instanceof HTTPException
        ? { code: "INTERNAL", status: error.status, message: error.message }
        : { code: "INTERNAL", status: 500, message: "Internal Server Error" };
  if (!(error instanceof HTTPException)) console.error("[unhandled]", error);

  // An HTML request to a page gets the app's error page, if it has one
  const page = await errorPageFor(c, shown);
  return (
    page ??
    c.json(
      errorBody(shown.code, shown.message, "details" in shown ? shown.details : undefined),
      shown.status as ContentfulStatusCode,
    )
  );
};
