import type { Context, MiddlewareHandler, TypedResponse } from "hono";
import { routePath } from "hono/route";
import type {
  ContentfulStatusCode,
  SuccessStatusCode,
} from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import {
  errorBody,
  fail,
  toHttpError,
  ValidationError,
  type AnyFailure,
  type HttpError,
  type ToHttpError,
} from "./failure.js";
import type { RegisteredDeps, RegisteredEnv } from "./register.js";
import {
  type AnySchema,
  type RouteConfig,
  type RouteConfigToEnv,
  type RouteConfigToTypedResponse,
  type RouteHandler,
  type SchemaOfResponse,
} from "./route-types.js";
import {
  hnkSchema,
  issue,
  type InferOutput,
} from "./standard-schema.js";

import type { System } from "./system.js";

/**
 * Where and how many `as never` / `as unknown as` are allowed is fixed and checked by test/source.test.mjs
 */

// ---- Dependencies ----

/** A slot used only inside hono-kit. App code does not take deps out of c.var */
const DEPS_KEY = "hnk:deps";

/**
 * Middleware that builds deps per request. `app.use("*", provideDeps(makeDeps))`.
 *
 * If deps were built once at startup, Workers would reject I/O across requests
 * for a connection-holding DB. So it takes how to build, not what was built.
 * Nothing is built here. Deps are built once, when an endpoint handler first receives them, so
 * nothing is built for requests that just return 401, or for /openapi.json
 */
export const provideDeps =
  (
    makeDeps: (env: RegisteredEnv["Bindings"]) => RegisteredDeps,
  ): MiddlewareHandler =>
  async (c, next) => {
    let made: RegisteredDeps | undefined;
    const resolve = () => (made ??= makeDeps(c.env));
    c.set(DEPS_KEY as never, resolve as never);
    await next();
  };

type MaybePromise<T> = T | Promise<T>;
// ---- responses declarations ----

/** A response with a description (shown in the OpenAPI document). Only failure responses use it; apps write schemas as is */
const described = <T extends AnySchema>(schema: T, description: string) => ({
  schema,
  description,
});

type ErrorBody<K extends string> = { error: { code: K; message: string } };

/** The failure response body `{ error: { code, message } }`. code is one of the declared failures */
const errorSchema = <K extends string>(codes: readonly K[]) =>
  hnkSchema<ErrorBody<K>, ErrorBody<K>>(
    (value) => {
      const error = (value as Partial<ErrorBody<string>> | null)?.error;
      if (
        typeof error?.message !== "string" ||
        !(codes as readonly string[]).includes(error.code)
      )
        return issue(`error.code must be one of ${codes.join(" / ")}`);

      return { value: value as ErrorBody<K> };
    },
    () => ({
      type: "object",
      properties: {
        error: {
          type: "object",
          properties: {
            code: { type: "string", enum: codes },
            message: { type: "string" },
          },
          required: ["code", "message"],
        },
      },
      required: ["error"],
    }),
  );

/** Attaches the failures that may be returned with that status to the response declaration. Not shown in OpenAPI */
const DECLARED_ERRORS: unique symbol = Symbol("hnk.declaredErrors");

type ErrorResponse = ReturnType<typeof described> & {
  readonly [DECLARED_ERRORS]: readonly HttpError[];
};

/** Merges failures with the same status into one response. Codes become a union of literals; messages are kept per code */
const errorResponseOf = (errors: readonly HttpError[]): ErrorResponse => ({
  ...described(
    errorSchema(errors.map((e) => e.code)),
    errors.map((e) => e.message).join(" / "),
  ),
  [DECLARED_ERRORS]: errors,
});

/**
 * The failure part of responses. Failures carry their status, so you do not write it by hand.
 * `responses: { 200: invoiceSchema, ...errorResponses(Unauthorized, NotFound) }`
 * Several failures with the same status are merged into one response, so none is lost
 */
export const errorResponses = <const T extends readonly AnyFailure[]>(
  ...failures: T
) => {
  const byStatus = new Map<number, HttpError[]>();
  for (const e of failures.map(toHttpError))
    byStatus.set(e.status, [...(byStatus.get(e.status) ?? []), e]);

  return Object.fromEntries(
    [...byStatus].map(([status, group]) => [status, errorResponseOf(group)]),
  ) as unknown as ErrorResponses<ToHttpError<T[number]>>;
};

type ErrorResponses<E extends HttpError> = {
  [S in E["status"]]: {
    description: string;
    schema: ReturnType<typeof errorSchema<Extract<E, { status: S }>["code"]>>;
  };
};

/** Merges two responses. Failure declarations with the same status are combined, not overwritten */
const mergeResponses = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) => {
  const merged: Record<string, unknown> = { ...a, ...b };
  for (const status of Object.keys(a)) {
    const left = (a[status] as Partial<ErrorResponse>)[DECLARED_ERRORS];
    const right = (b[status] as Partial<ErrorResponse> | undefined)?.[
      DECLARED_ERRORS
    ];
    if (left && right) merged[status] = errorResponseOf([...left, ...right]);
  }
  return merged;
};

// ---- guards and automatic failure declarations ----

const GUARD_ERRORS: unique symbol = Symbol("hnk.guardErrors");

/** Middleware that carries the failures it may return */
export type Guard<
  M extends MiddlewareHandler,
  E extends readonly AnyFailure[],
> = M & {
  readonly [GUARD_ERRORS]: E;
};

/**
 * Gives a middleware the failures it may return. Put it in an endpoint's middleware and
 * those failures are added to responses automatically. `export const requireAuth = guard([Unauthorized], ...)`
 */
export const guard = <
  const F extends readonly AnyFailure[],
  M extends MiddlewareHandler,
>(
  failures: F,
  middleware: M,
): Guard<M, F> => Object.assign(middleware, { [GUARD_ERRORS]: failures });

type GuardErrorsOf<M> = M extends readonly unknown[]
  ? GuardErrorsOf<M[number]>
  : M extends { readonly [GUARD_ERRORS]: infer E extends readonly AnyFailure[] }
    ? ToHttpError<E[number]>
    : never;

const INPUT_PARTS = ["param", "query", "header", "cookie", "json"] as const;

/** Whether there is input validation. If so, ValidationError may be returned */
type HasInput<R> = R extends { request: infer Q }
  ? Extract<keyof Q, (typeof INPUT_PARTS)[number]> extends never
    ? false
    : true
  : false;

/** Failures added automatically: those of the guards, and ValidationError when there is input */
type AutoErrors<R> =
  | GuardErrorsOf<R extends { middleware: infer M } ? M : never>
  | (HasInput<R> extends true ? typeof ValidationError : never);

/** Codes of the failures written by hand. The only ones reply.failure accepts */
declare const DECLARED_BY_HAND: unique symbol;

type WithAutoErrors<R extends RouteConfig> = Omit<R, "responses"> & {
  responses: R["responses"] & ErrorResponses<AutoErrors<R>>;
  readonly [DECLARED_BY_HAND]?: {
    [S in keyof R["responses"]]: CodeOf<R, S>;
  }[keyof R["responses"]];
};

/**
 * A route declaration with the automatic failure declarations added.
 * Failures a guard may return (Unauthorized for requireAuth) and ValidationError when there is input
 * need not be written in responses. Write only domain failures
 */
const createRoute = <const R extends RouteConfig>(config: R) => {
  const middleware = [config.middleware ?? []].flat() as {
    [GUARD_ERRORS]?: readonly AnyFailure[];
  }[];
  const auto: HttpError[] = middleware.flatMap((m) =>
    (m[GUARD_ERRORS] ?? []).map(toHttpError),
  );
  if (INPUT_PARTS.some((part) => config.request?.[part] !== undefined))
    auto.push(ValidationError);

  return {
    ...config,
    responses: mergeResponses(errorResponses(...auto), config.responses),
  } as WithAutoErrors<R>;
};

// ---- reply ----

type JsonSchemaOf<R extends RouteConfig, S> = S extends keyof R["responses"]
  ? SchemaOfResponse<R["responses"][S]>
  : never;

type JsonBodyOf<R extends RouteConfig, S> = InferOutput<JsonSchemaOf<R, S>>;

type CodeOf<R extends RouteConfig, S> =
  JsonBodyOf<R, S> extends { error: { code: infer K } } ? K : never;

/** The 2xx responses this route declares */
type DeclaredSuccess<R extends RouteConfig> = keyof R["responses"] &
  SuccessStatusCode;

/** The type of a route built by createRoute */
type Built<C extends RouteConfig> = ReturnType<typeof createRoute<C>>;

/**
 * Failure codes reply.failure accepts. Only those written by hand
 * (failures from guards or input validation are excluded, since the handler does not return them)
 */
type DeclaredFailure<R extends RouteConfig> = R extends {
  readonly [DECLARED_BY_HAND]?: infer K;
}
  ? Exclude<K, undefined>
  : { [S in keyof R["responses"]]: CodeOf<R, S> }[keyof R["responses"]];

/**
 * The message shown as the argument type when reply.failure is called on a route that declares no failures.
 * With `never` here, the reason for the red squiggle would be unreadable
 */
type NoFailureDeclared =
  "This route declares no domain failures. Add ...errorResponses(NotFound, ...) to responses";

/** Returns the declared status for each failure code, keeping "NOT_FOUND means 404" in the type */
type FailureResponse<R extends RouteConfig, K> = {
  [S in keyof R["responses"] & ContentfulStatusCode]: K extends CodeOf<R, S>
    ? TypedResponse<{ error: { code: K; message: string } }, S, "json">
    : never;
}[keyof R["responses"] & ContentfulStatusCode];

/**
 * A way of returning, typed from the route's responses.
 * With c.json, a mismatch is underlined at the top of the handler. reply takes the expected shape as its argument, so
 * the wrong value itself is underlined
 */
type Reply<R extends RouteConfig> = {
  <S extends DeclaredSuccess<R>>(
    status: S,
    body: NoInfer<JsonBodyOf<R, S>>,
  ): TypedResponse<JSONParsed<JsonBodyOf<R, S>>, S, "json">;
  /**
   * An expected failure. Passing an undeclared code underlines the argument with "these are the declared ones".
   * The return type is then never, so the same cause is not underlined again at the top of the handler
   */
  failure<K extends string>(
    // & string makes error messages show the contents ("NOT_FOUND", ...) instead of the type name
    error: [K] extends [DeclaredFailure<R>]
      ? K
      : [DeclaredFailure<R>] extends [never]
        ? NoFailureDeclared
        : DeclaredFailure<R> & string,
  ): [K] extends [DeclaredFailure<R>] ? FailureResponse<R, K> : never;
};

/** Finds the failure for that code in the declaration, which knows its status and message */
const findDeclaredFailure = (route: RouteConfig, code: string, c: Context) => {
  for (const [status, response] of Object.entries(route.responses)) {
    const declared = (response as Partial<ErrorResponse>)[
      DECLARED_ERRORS
    ]?.find((e) => e.code === code);
    if (declared)
      return {
        status: Number(status) as ContentfulStatusCode,
        message: declared.message,
      };
  }
  throw new Error(
    `${code} is not declared in the responses of ${c.req.method} ${routePath(c)}`,
  );
};

/** The declaration type after adding automatic failures, used for hc response types and the like */
export type BuiltRoute<C extends RouteConfig> = Built<C>;

/**
 * The handler type. Receive (c), return (reply) and use (deps) are fixed by argument position
 */
export type EndpointFn<C extends RouteConfig> = (
  c: Parameters<
    RouteHandler<Built<C>, RouteConfigToEnv<Built<C>> & RegisteredEnv>
  >[0],
  reply: Reply<Built<C>>,
  deps: RegisteredDeps,
) => MaybePromise<RouteConfigToTypedResponse<Built<C>>>;

/**
 * Pairs a declaration with a handler. Used by createEndpoint
 */
export const buildEndpoint = <const C extends RouteConfig>(
  config: C,
  fn: EndpointFn<C>,
) => {
  const route = createRoute(config);
  const handler: RouteHandler<
    Built<C>,
    RouteConfigToEnv<Built<C>> & RegisteredEnv
  > = (c: Context) => {
    const reply = ((status: number, body: unknown) =>
      c.json(body as never, status as never)) as unknown as Reply<Built<C>>;
    reply.failure = ((code: string) => {
      const declared = findDeclaredFailure(route, code, c);
      return c.json(errorBody(code, declared.message), declared.status);
    }) as unknown as Reply<Built<C>>["failure"];

    const resolve = c.get(DEPS_KEY as never) as
      (() => RegisteredDeps) | undefined;
    if (resolve === undefined)
      throw new Error(
        'provideDeps is not installed. Add app.use("*", provideDeps(makeDeps))',
      );
    const deps = resolve();

    // R is not fixed here, so TS cannot match it up and we re-type it. Callers are guarded by the type of fn
    return fn(c as never, reply, deps) as never;
  };

  return [route, handler] as const;
};
