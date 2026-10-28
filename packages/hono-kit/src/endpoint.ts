import type { Context, MiddlewareHandler, TypedResponse } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import { type ContentMap, isContentMap, negotiate } from "./content.js";
import { errorPageFor } from "./error-page.js";
import {
  errorBody,
  fail,
  NotAcceptable,
  toHttpError,
  ValidationError,
  type AnyFailure,
  type DeclaredError,
  type HttpError,
  type ToHttpError,
} from "./failure.js";
import { type FileBody, type FileResponse, isFile } from "./file.js";
import {
  allowedLocation,
  isRedirect,
  REDIRECT,
  type RedirectResponse,
} from "./redirect.js";
import type {
  DepsVariables,
  RegisteredDeps,
  RegisteredEnv,
} from "./register.js";
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
  toJsonSchema,
  type InferOutput,
} from "./standard-schema.js";

/**
 * Where and how many `as never` / `as unknown as` are allowed is fixed and checked by test/source.test.mjs
 */

// ---- Dependencies ----

/**
 * Middleware that builds deps per request and puts them in Hono's context: `app.use("*", provideDeps(makeDeps))`,
 * then `c.var.deps` in handlers and in the middleware after it.
 *
 * If deps were built once at startup, Workers would reject I/O across requests
 * for a connection-holding DB. So it takes how to build, not what was built.
 * It is optional: an app that imports what it uses needs no deps
 */
export const provideDeps = (
  makeDeps: (env: RegisteredEnv["Bindings"]) => RegisteredDeps,
) =>
  createMiddleware<{
    Bindings: RegisteredEnv["Bindings"];
    Variables: DepsVariables;
  }>(async (c, next) => {
    c.set("deps", makeDeps(c.env));
    await next();
  });

type MaybePromise<T> = T | Promise<T>;
// ---- responses declarations ----

/** A response with a description (shown in the OpenAPI document). Only failure responses use it; apps write schemas as is */
const described = <T extends AnySchema>(schema: T, description: string) => ({
  schema,
  description,
});

/**
 * The failure response body `{ error: { code, message } }`, one per declared failure.
 * A failure that declares details has `details` too, so the client knows their shape from the code
 */
type ErrorBody<E extends HttpError> = E extends {
  details: infer D extends AnySchema;
}
  ? { error: { code: E["code"]; message: string; details: InferOutput<D> } }
  : { error: { code: E["code"]; message: string } };

const errorObjectSchema = (
  codes: readonly string[],
  details?: Record<string, unknown>,
) => ({
  type: "object",
  properties: {
    code: { type: "string", enum: codes },
    message: { type: "string" },
    ...(details && { details }),
  },
  required: details ? ["code", "message", "details"] : ["code", "message"],
});

/** The failure response body. code is one of the declared failures, with the details it declares */
const errorSchema = <E extends DeclaredError>(errors: readonly E[]) => {
  const codes = errors.map((e) => e.code);
  return hnkSchema<ErrorBody<E>, ErrorBody<E>>(
    async (value) => {
      const error = (value as { error?: Record<string, unknown> } | null)
        ?.error;
      const declared = errors.find((e) => e.code === error?.code);
      if (typeof error?.message !== "string" || declared === undefined)
        return issue(`error.code must be one of ${codes.join(" / ")}`);
      if (declared.details) {
        const checked =
          await declared.details["~standard"].validate(error.details);
        if (checked.issues)
          return issue(`error.details of ${declared.code}: ${checked.issues[0]?.message}`);
      }

      return { value: value as ErrorBody<E> };
    },
    (io, options) => {
      const plain = errors.filter((e) => !e.details).map((e) => e.code);
      const withDetails = errors.filter((e) => e.details);
      // Without details it stays one object with an enum of codes; each failure with details is its own branch
      const objects = [
        ...(plain.length > 0 ? [errorObjectSchema(plain)] : []),
        ...withDetails.map((e) =>
          errorObjectSchema([e.code], toJsonSchema(e.details!, io, options)),
        ),
      ];
      return {
        type: "object",
        properties: {
          error: objects.length === 1 ? objects[0] : { oneOf: objects },
        },
        required: ["error"],
      };
    },
  );
};

/** Attaches the failures that may be returned with that status to the response declaration. Not shown in OpenAPI */
const DECLARED_ERRORS: unique symbol = Symbol("hnk.declaredErrors");

type ErrorResponse = ReturnType<typeof described> & {
  readonly [DECLARED_ERRORS]: readonly DeclaredError[];
};

/** Merges failures with the same status into one response. Codes become a union of literals; messages are kept per code */
const errorResponseOf = (errors: readonly DeclaredError[]): ErrorResponse => ({
  ...described(
    errorSchema(errors),
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
  const byStatus = new Map<number, DeclaredError[]>();
  for (const e of failures.map(toHttpError) as DeclaredError[])
    byStatus.set(e.status, [...(byStatus.get(e.status) ?? []), e]);

  return Object.fromEntries(
    [...byStatus].map(([status, group]) => [status, errorResponseOf(group)]),
  ) as unknown as ErrorResponses<ToHttpError<T[number]>>;
};

type ErrorResponses<E extends HttpError> = {
  [S in E["status"]]: {
    description: string;
    schema: ReturnType<typeof errorSchema<Extract<E, { status: S }>>>;
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
 * Gives a middleware the failures it may return. Put it in an endpoint's auth (or middleware) and
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

/** A map of formats (`{ "application/json": ..., "text/html": ... }`), as opposed to a schema, a failure, a file or a redirect */
type IsContentMap<E> = [E] extends [never]
  ? false // no 200 declared
  : E extends AnySchema
  ? false
  : E extends { schema: unknown }
    ? false
    : E extends FileResponse | RedirectResponse
      ? false
      : E extends object
        ? true
        : false;

type Success<R> = R extends { responses: { 200: infer E } } ? E : never;

/**
 * Failures added automatically: those of the guards, ValidationError when there is input,
 * and NotAcceptable when the success has several formats to choose from
 */
type AutoErrors<R> =
  | GuardErrorsOf<R extends { auth: infer A } ? A : never>
  | GuardErrorsOf<R extends { middleware: infer M } ? M : never>
  | (HasInput<R> extends true ? typeof ValidationError : never)
  | (IsContentMap<Success<R>> extends true ? typeof NotAcceptable : never);

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
 * need not be written in responses. Write only the failures the handler returns
 */
const createRoute = <const R extends RouteConfig>(config: R) => {
  const middleware = [config.auth, config.middleware ?? []].flat() as {
    [GUARD_ERRORS]?: readonly AnyFailure[];
  }[];
  const auto: HttpError[] = middleware.flatMap((m) =>
    (m[GUARD_ERRORS] ?? []).map(toHttpError),
  );
  if (INPUT_PARTS.some((part) => config.request?.[part] !== undefined))
    auto.push(ValidationError);
  if (isContentMap(config.responses[200])) auto.push(NotAcceptable);

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

type CodeOf<R extends RouteConfig, S> = CodeOfBody<JsonBodyOf<R, S>>;

/** Spread over the failure bodies of one status, so each body gives its own code */
type CodeOfBody<B> = B extends { error: { code: infer K } } ? K : never;

/** The details that failure declares, or undefined when it declares none */
type DetailsOf<R extends RouteConfig, K> =
  Extract<
    { [S in keyof R["responses"]]: JsonBodyOf<R, S> }[keyof R["responses"]],
    { error: { code: K } }
  > extends { error: { details: infer D } }
    ? D
    : undefined;

/** The code of what was passed to reply.failure */
type CodeIn<E> = E extends string ? E : E extends { code: infer K } ? K : never;

/** What reply.failure takes for that code: the code alone, or the code with its details */
type FailureArg<R extends RouteConfig, K> = [DetailsOf<R, K>] extends [
  undefined,
]
  ? K
  : { readonly code: K; readonly details: DetailsOf<R, K> };

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
  "This route declares no failures. Add ...errorResponses(NotFound, ...) to responses";

/** Returns the declared status for each failure code, keeping "NOT_FOUND means 404" in the type */
type FailureResponse<R extends RouteConfig, K> = {
  [S in keyof R["responses"] & ContentfulStatusCode]: K extends CodeOf<R, S>
    ? TypedResponse<
        JSONParsed<Extract<JsonBodyOf<R, S>, { error: { code: K } }>>,
        S,
        "json"
      >
    : never;
}[keyof R["responses"] & ContentfulStatusCode];

/**
 * A way of returning, typed from the route's responses.
 * With c.json, a mismatch is underlined at the top of the handler. reply takes the expected shape as its argument, so
 * the wrong value itself is underlined
 */
type Reply<R extends RouteConfig> = {
  /**
   * Success. It is always 200 (lint route-responds-200), so only the body is passed.
   * On a route that declares `200: file()`, the body is the file and its type: `{ body, contentType }`
   */
  success(
    body: DeclaresFile<R> extends true
      ? FileBody
      : IsContentMap<R["responses"][200]> extends true
        ? NoInfer<DataOfFormats<R["responses"][200]>>
        : NoInfer<JsonBodyOf<R, 200>>,
  ): DeclaresFile<R> extends true
    ? TypedResponse<unknown, 200, "body">
    : [JsonSchemaOf<R, 200>] extends [never]
      ? TypedResponse<string, 200, "text">
      : TypedResponse<JSONParsed<JsonBodyOf<R, 200>>, 200, "json">;
  /**
   * An expected failure. Passing an undeclared code underlines the argument with "these are the declared ones".
   * A failure that declares details takes them too: `{ code, details }` (what a function returned in err)
   * The return type is then never, so the same cause is not underlined again at the top of the handler
   */
  failure<
    const E extends
      | string
      | { readonly code: string; readonly details: unknown },
  >(
    // E is the whole argument, so it is inferred from a variable too (a Result's error). The rest only checks it:
    // NoInfer keeps TS from inferring E from the expected shape (it would turn an object into its code).
    // A wrong detail is then underlined where it is, as "not assignable to never".
    // & string makes error messages show the contents ("NOT_FOUND", ...) instead of the type name
    error: [CodeIn<E>] extends [DeclaredFailure<R>]
      ? E & NoInfer<FailureArg<R, CodeIn<E>>>
      : [DeclaredFailure<R>] extends [never]
        ? NoFailureDeclared
        : DeclaredFailure<R> & string,
  ): [CodeIn<E>] extends [DeclaredFailure<R>]
    ? FailureResponse<R, CodeIn<E>>
    : never;
  /**
   * Sends people elsewhere, always with 303. Only on a route that declares `303: redirect()`.
   * The location must be a path of this app, or on an origin the declaration names; anything else throws (500)
   */
  redirect(
    location: DeclaresRedirect<R> extends true ? string : NoRedirectDeclared,
  ): DeclaresRedirect<R> extends true
    ? TypedResponse<undefined, 303, "redirect">
    : never;
};

/** The data a map of formats is made from: the JSON schema's output, or else what its renderers take */
type DataOfFormats<M> = M extends {
  "application/json": infer S extends AnySchema;
}
  ? InferOutput<S>
  : { [K in keyof M]: M[K] extends (data: infer T) => unknown ? T : never }[keyof M];

type DeclaresFile<R extends RouteConfig> = 200 extends keyof R["responses"]
  ? R["responses"][200] extends FileResponse
    ? true
    : false
  : false;

type DeclaresRedirect<R extends RouteConfig> = 303 extends keyof R["responses"]
  ? R["responses"][303] extends RedirectResponse
    ? true
    : false
  : false;

/** The argument type of reply.redirect on a route that declares no redirect, so the red squiggle says why */
type NoRedirectDeclared =
  "This route declares no redirect. Add 303: redirect() to responses";

/** Sends the data in the chosen format: JSON as it is, the others through their renderer */
const sendFormat = async (
  c: Context,
  formats: ContentMap,
  format: string,
  body: unknown,
) => {
  const entry = formats[format as keyof ContentMap];
  if (typeof entry !== "function") return c.json(body as never, 200);
  const rendered = await entry(body);
  if (format === "text/html") return c.html(rendered, 200);
  return c.body(String(rendered), 200, {
    "Content-Type": `${format}; charset=UTF-8`,
  });
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
 * The handler type. Receive (c) and return (reply) are fixed by argument position; deps are in `c.var.deps`
 */
export type EndpointFn<C extends RouteConfig> = (
  c: Parameters<
    RouteHandler<Built<C>, RouteConfigToEnv<Built<C>> & RegisteredEnv>
  >[0],
  reply: Reply<Built<C>>,
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
    // A map of formats is chosen from before the handler runs, so a POST does not write and then answer 406
    const success = route.responses[200];
    const formats = isContentMap(success) ? Object.keys(success) : [];
    const format = negotiate(c.req.header("Accept"), formats);
    if (formats.length > 0 && format === undefined) throw fail(NotAcceptable);
    // Caches must keep one copy per Accept, or someone asking for HTML gets the JSON cached before
    if (formats.length > 1) c.header("Vary", "Accept", { append: true });

    const reply = {
      success: (body: unknown) => {
        if (isContentMap(success) && format !== undefined)
          return sendFormat(c, success, format, body);
        if (!isFile(success)) return c.json(body as never, 200);
        const sent = body as FileBody;
        return c.body(sent.body, 200, {
          "Content-Type": sent.contentType ?? "application/octet-stream",
        });
      },
      redirect: (location: string) => {
        const declared = route.responses[303];
        if (!isRedirect(declared))
          throw new Error(
            `${c.req.method} ${routePath(c)} declares no redirect. Add 303: redirect() to responses`,
          );
        return c.redirect(
          allowedLocation(location, declared[REDIRECT].origins),
          303,
        );
      },
      failure: async (
        error: string | { code: string; details: unknown },
      ) => {
        const { code, details } =
          typeof error === "string" ? { code: error, details: undefined } : error;
        const declared = findDeclaredFailure(route, code, c);
        const page = await errorPageFor(c, { code, ...declared });
        return (
          page ??
          c.json(errorBody(code, declared.message, details), declared.status)
        );
      },
    } as unknown as Reply<Built<C>>;

    // R is not fixed here, so TS cannot match it up and we re-type it. Callers are guarded by the type of fn
    return fn(c as never, reply) as never;
  };

  return [route, handler] as const;
};
