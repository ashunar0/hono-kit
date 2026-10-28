import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { errorPageFor } from "./error-page.js";
import type { Failure, FailureKind } from "./failures.js";
import type { StandardSchema } from "./standard-schema.js";

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

/** When input validation fails. Used by createEndpoint */
export const ValidationError = httpError(
  "VALIDATION_ERROR",
  400,
  "Invalid request",
);

class HnkError extends HTTPException {
  constructor(
    readonly code: string,
    status: ContentfulStatusCode,
    message: string,
  ) {
    super(status, { message });
  }
}

/**
 * Creates a failure raised at the HTTP entry point. Outside handlers, e.g. in middleware: `throw fail(Unauthorized)`.
 * A failure that declares details is returned with them through reply.failure, never thrown
 */
export const fail = (
  failure: HttpError | (Failure & { readonly details?: undefined }),
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
      ? { code: error.code, status: error.status, message: error.message }
      : error instanceof HTTPException
        ? { code: "INTERNAL", status: error.status, message: error.message }
        : { code: "INTERNAL", status: 500, message: "Internal Server Error" };
  if (!(error instanceof HTTPException)) console.error("[unhandled]", error);

  // An HTML request to a page gets the app's error page, if it has one
  const page = await errorPageFor(c, shown);
  return (
    page ??
    c.json(
      errorBody(shown.code, shown.message),
      shown.status as ContentfulStatusCode,
    )
  );
};
