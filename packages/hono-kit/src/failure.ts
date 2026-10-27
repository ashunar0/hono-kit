import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Failure, FailureKind } from "./failures.js";

/** One failure returned over HTTP. Has a code, a status and a default message */
export type HttpError<
  K extends string = string,
  S extends ContentfulStatusCode = ContentfulStatusCode,
> = {
  readonly code: K;
  readonly status: S;
  readonly message: string;
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
    ? HttpError<K, (typeof FAILURE_STATUS)[Kind]>
    : F;

export const toHttpError = <const F extends AnyFailure>(
  failure: F,
): ToHttpError<F> =>
  ("status" in failure
    ? failure
    : httpError(
        failure.code,
        FAILURE_STATUS[failure.kind],
        failure.message,
      )) as ToHttpError<F>;

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

/** Creates a failure raised at the HTTP entry point. Outside handlers, e.g. in middleware: `throw fail(Unauthorized)` */
export const fail = (failure: AnyFailure, message = failure.message) => {
  const error = toHttpError(failure);

  return new HnkError(error.code, error.status, message);
};

export const errorBody = (code: string, message: string) => ({
  error: { code, message },
});

/** The single exit for every failure. `app.onError(onError)` */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof HnkError) {
    return c.json(
      errorBody(error.code, error.message),
      error.status as ContentfulStatusCode,
    );
  }
  if (error instanceof HTTPException) {
    return c.json(
      errorBody("INTERNAL", error.message),
      error.status as ContentfulStatusCode,
    );
  }
  console.error("[unhandled]", error);
  return c.json(errorBody("INTERNAL", "Internal Server Error"), 500);
};
