/**
 * Route declarations (config) and the types derived from them. Built on Hono's Handler / ToSchema, so
 * the types of c.req.valid(), reply and hc responses come from the declaration
 */
import type {
  Env,
  Handler,
  Input,
  MiddlewareHandler,
  TypedResponse,
  ValidationTargets,
} from "hono";
import type { H } from "hono/types";
import type { StatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import type { ContentMap } from "./content.js";
import type { FileResponse } from "./file.js";
import type { RedirectResponse } from "./redirect.js";
import type {
  InferInput,
  InferOutput,
  StandardSchema,
} from "./standard-schema.js";

type MaybePromise<T> = Promise<T> | T;

export type AnySchema = StandardSchema<any, any>;

/**
 * One response declaration. Apps write the schema as is.
 * `{ schema, description }` is a failure response made by errorResponses; its description (the failure message) appears in the OpenAPI document.
 * Schemas have Standard Schema's `~standard`, so the two can be told apart. `redirect()` declares a redirect (303 only), `file()` a file sent as it is,
 * and a map of media types (`{ "application/json": schema, "text/html": (data) => <Page /> }`) the formats chosen by Accept
 */
export type ResponseEntry =
  | AnySchema
  | { schema: AnySchema; description: string }
  | RedirectResponse
  | FileResponse
  | ContentMap;

/**
 * A route declaration. The keys of request match the names read in the handler with `c.req.valid("…")`
 * (declare `param`, read `c.req.valid("param")`). method is lowercase; path uses Hono syntax (`/users/:id`)
 */
export type RouteConfig = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  /** Who may call it: a guard (requireAuth, allowAnonymous, ...). It runs first and sets actor */
  auth: H;
  /** Other middleware, run after auth */
  middleware?: H | H[];
  request?: {
    param?: AnySchema;
    query?: AnySchema;
    header?: AnySchema;
    cookie?: AnySchema;
    /** The JSON body */
    json?: AnySchema;
  };
  responses: { [status: number]: ResponseEntry };
};

/** Takes the schema out of a response declaration. For a map of formats, the JSON one's */
export type SchemaOfResponse<T> = T extends AnySchema
  ? T
  : T extends { schema: infer S extends AnySchema }
    ? S
    : T extends { "application/json": infer S extends AnySchema }
      ? S
      : never;

// ---- Input ----

type HasUndefined<T> = undefined extends T ? true : false;

type InputTypeBase<
  R extends RouteConfig,
  Part extends keyof ValidationTargets,
> = R["request"] extends { [K in Part]: infer S extends AnySchema }
  ? {
      in: {
        [K in Part]: HasUndefined<ValidationTargets[K]> extends true
          ? { [K2 in keyof InferInput<S>]?: InferInput<S>[K2] }
          : { [K2 in keyof InferInput<S>]: InferInput<S>[K2] };
      };
      out: { [K in Part]: InferOutput<S> };
    }
  : {};

type InputTypeJson<R extends RouteConfig> = R["request"] extends {
  json: infer S extends AnySchema;
}
  ? { in: { json: InferInput<S> }; out: { json: InferOutput<S> } }
  : {};

export type ComputeInput<R extends RouteConfig> = InputTypeBase<R, "param"> &
  InputTypeBase<R, "query"> &
  InputTypeBase<R, "header"> &
  InputTypeBase<R, "cookie"> &
  InputTypeJson<R>;

// ---- Output ----

type DefinedStatusCodes<R extends RouteConfig> = keyof R["responses"] &
  StatusCode;

/** The union of declared responses. Becomes the hc response type */
export type RouteConfigToTypedResponse<R extends RouteConfig> = {
  [Status in DefinedStatusCodes<R>]: R["responses"][Status] extends RedirectResponse
    ? TypedResponse<undefined, Status, "redirect">
    : R["responses"][Status] extends FileResponse
      ? TypedResponse<unknown, Status, "body">
      : // hc reads JSON; a map with no JSON format reaches it as text
        [SchemaOfResponse<R["responses"][Status]>] extends [never]
        ? TypedResponse<string, Status, "text">
        : TypedResponse<
        JSONParsed<InferOutput<SchemaOfResponse<R["responses"][Status]>>>,
        Status,
        "json"
      >;
}[DefinedStatusCodes<R>];

// ---- middleware Env ----

type AsArray<T> = T extends undefined ? [] : T extends any[] ? T : [T];

type DeepSimplify<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? DeepSimplify<T[K]>
    : T[K];
} & {};

type OfHandlerType<T> =
  T extends MiddlewareHandler<infer E, infer P, infer I>
    ? { env: E; path: P; input: I }
    : never;

/** The listed middleware combined into one type (Envs merged) */
type MiddlewareToHandlerType<M extends MiddlewareHandler<any, any, any>[]> =
  M extends [infer First, infer Second, ...infer Rest]
    ? First extends MiddlewareHandler<any, any, any>
      ? Second extends MiddlewareHandler<any, any, any>
        ? Rest extends MiddlewareHandler<any, any, any>[]
          ? MiddlewareToHandlerType<
              [
                MiddlewareHandler<
                  DeepSimplify<
                    OfHandlerType<First>["env"] & OfHandlerType<Second>["env"]
                  >,
                  OfHandlerType<First>["path"],
                  OfHandlerType<First>["input"]
                >,
                ...Rest,
              ]
            >
          : never
        : never
      : never
    : M extends [infer Last]
      ? Last
      : MiddlewareHandler<Env>;

type RouteMiddlewareParams<R extends RouteConfig> = OfHandlerType<
  MiddlewareToHandlerType<
    [R["auth"], ...(R extends { middleware: infer M } ? AsArray<M> : [])]
  >
>;

export type RouteConfigToEnv<R extends RouteConfig> =
  RouteMiddlewareParams<R> extends never
    ? Env
    : RouteMiddlewareParams<R>["env"];

/** A handler. c.req.valid() and c come from the declaration, and only declared responses can be returned */
export type RouteHandler<
  R extends RouteConfig,
  E extends Env = RouteConfigToEnv<R>,
  I extends Input = ComputeInput<R>,
  P extends string = R["path"],
> = Handler<E, P, I, MaybePromise<RouteConfigToTypedResponse<R>>>;
