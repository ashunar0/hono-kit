import { Hono, type MiddlewareHandler, type ToSchema } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { H, ParamKeys } from "hono/types";
import { defineHandler } from "./define-handler.js";
import {
  buildEndpoint,
  provideDeps,
  type BuiltRoute,
  type EndpointFn,
} from "./endpoint.js";
import { rememberFormat } from "./error-page.js";
import { errorBody, HnkError, invalid, onError } from "./failure.js";
import { NotFound } from "./failures.js";
import type { RedirectResponse } from "./redirect.js";
import type {
  RegisteredBindings,
  RegisteredDeps,
  RegisteredEnv,
} from "./register.js";
import type { InferInput, InferOutput } from "./standard-schema.js";
import type {
  AnySchema,
  ComputeInput,
  RouteConfig,
  RouteConfigToTypedResponse,
} from "./route-types.js";

/** Attaches the declaration to the handler. The OpenAPI document is built by reading it from registered handlers */
export const ROUTE: unique symbol = Symbol("hnk.route");

/** application/json and application/*+json, with optional parameters (charset, ...) */
const JSON_CONTENT_TYPE = /^application\/([a-z0-9.-]+\+)?json(\s*;.*)?$/i;

/**
 * Rejects a body that is not declared as JSON. Without a JSON Content-Type, the body is not read and the schema is
 * handed {}, so a schema whose fields are all optional would accept any body as {}
 */
const requireJsonBody: MiddlewareHandler = async (c, next) => {
  if (!JSON_CONTENT_TYPE.test(c.req.header("content-type") ?? "")) {
    throw invalid([{ message: "Content-Type must be application/json" }]);
  }
  await next();
};

/** The requests whose handler has started: a 400 thrown after that is the handler's own, not the input's */
const started = new WeakSet<Context>();

/**
 * defineHandler answers input it cannot read or that fails a schema with its own HTTPException(400). That is the
 * ValidationError every endpoint with input already declares, with its fields, so it is turned into one. Only the
 * first target that failed is reported (param → query → header → cookie → json), as each field is named in it
 */
const asValidationError =
  (handler: H): H =>
  async (c, next) => {
    try {
      return await handler(c, next);
    } catch (error) {
      if (
        error instanceof HTTPException &&
        !(error instanceof HnkError) &&
        error.status === 400 &&
        !started.has(c)
      ) {
        const failed = (error.cause as { issues?: { issues: StandardIssues }[] } | undefined)
          ?.issues?.[0];
        throw invalid(failed?.issues ?? [{ message: error.message }]);
      }
      throw error;
    }
  };

type StandardIssues = Parameters<typeof invalid>[0];

/**
 * The app's root, instead of `new Hono()`: `createApp({ makeDeps })` in src/main.ts.
 * It reads the clock once per request into c.get("now"), puts makeDeps' result in c.var.deps,
 * and answers every failure through onError, a path no endpoint has too (NOT_FOUND, as JSON like the rest). Add the app's middleware after it, then registerRoutes(app) last.
 * Tests pass their own makeDeps (stand-ins) and clock (a fixed time).
 * The return type is written out so the published .d.ts keeps RegisteredEnv instead of resolving it to Env
 */
export const createApp = (
  options: {
    makeDeps?: (env: RegisteredBindings) => RegisteredDeps;
    clock?: () => Date;
  } = {},
): Hono<RegisteredEnv> => {
  const { makeDeps, clock = () => new Date() } = options;
  const app = new Hono<RegisteredEnv>().use("*", async (c, next) => {
    c.set("now", clock());
    await next();
  });
  if (makeDeps) app.use("*", provideDeps(makeDeps));
  app.onError(onError);
  app.notFound((c) => c.json(errorBody(NotFound.code, NotFound.message), 404));
  return app;
};

// ---- createEndpoint: one file per resource, one export per method ----

/**
 * The declaration of one endpoint. The method and path are not written: they come from the file,
 * the export name (GET, POST, ...) and where the file sits under src/routes
 */
export type EndpointDeclaration = Omit<RouteConfig, "method" | "path">;

/** The declaration seen as a route. The method and path are fixed when routes.gen.ts registers it */
type AsRoute<
  D extends EndpointDeclaration,
  M extends RouteConfig["method"] = RouteConfig["method"],
  P extends string = string,
> = D & { method: M; path: P };

declare const DECLARATION: unique symbol;

/**
 * The handlers to register, in order (auth, middleware, input validation, the handler). The declaration rides along in the type.
 * The brand is required, not just carried: a plain `H[]` built by hand (no auth, no responses contract) must not
 * type-check where an Endpoint is expected. Only createEndpoint may produce one
 */
export type Endpoint<D extends EndpointDeclaration> = readonly H[] & {
  readonly [DECLARATION]: D;
};

/**
 * One endpoint. `export const GET = createEndpoint({ auth, request, responses }, async (c, reply) => ...)`.
 * routes.gen.ts registers it with registerEndpoint
 */
export const createEndpoint = <const D extends EndpointDeclaration>(
  checked: D & AuthSetsCurrentUser<D> & RedirectAt303<D> & RenderersTakeJson<D>,
  fn: EndpointFn<AsRoute<D>>,
): Endpoint<D> => {
  const config: D = checked;
  const [route, handler] = buildEndpoint(config as AsRoute<D>, fn);
  const { param, query, header, cookie, json } = route.request ?? {};
  // auth and the route's middleware run first, then the input is validated, then the handler (Hono's defineHandler).
  // Its `response` is not used: with it, the handler could not return a declared failure. reply checks the success
  const middleware = [route.auth, route.middleware ?? [], json ? [requireJsonBody] : []].flat();
  const defined = defineHandler({ param, query, header, cookie, json })(
    ...middleware,
    (c: Context) => {
      started.add(c);
      return (handler as (c: Context) => unknown)(c);
    },
  );

  // DECLARATION is a brand with no runtime value: nothing to assign, only to assert
  // rememberFormat goes first so that a failure thrown by auth or validation still knows it is for a page
  return [
    rememberFormat(route),
    Object.assign(asValidationError(defined as H), { [ROUTE]: route }),
  ] as unknown as Endpoint<D>;
};

/**
 * Registers an endpoint at that method and path. Called by routes.gen.ts, not by hand.
 * The app's type does not come from here: routes.gen.ts writes it with EndpointSchema
 */
export const registerEndpoint = <
  P extends string,
  D extends EndpointDeclaration,
>(
  app: Hono<any, any, any>,
  method: Uppercase<RouteConfig["method"]>,
  path: P,
  endpoint: Endpoint<D> & ParamsDeclared<P, D>,
): void => {
  // Hono's on is typed per number of handlers, so a list of unknown length matches none of them
  (app.on as (...args: unknown[]) => unknown).call(
    app,
    method,
    path,
    ...endpoint,
  );
};

/** The Env a middleware was given. `any` when it was not typed (`createMiddleware(async (c, next) => ...)` with no type argument) */
type EnvOf<M> = M extends MiddlewareHandler<infer E, any, any, any> ? E : never;

/** True only for `any`. A plain `extends any` matches everything, so this needs the `0 extends 1 & T` shape */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * auth decides who may call, so its middleware must set currentUser (the signed-in user, null for anyone, ...).
 * A middleware that only loads something (a session, a trace ID) sets no currentUser, so it cannot stand in for a guard.
 * An untyped middleware (Env `any`) is refused too: it would seem to set currentUser, and leave every c.var in the handler `any`.
 * When it does not hold, auth is underlined with this message
 */
/**
 * When the success has a JSON schema and renderers, each renderer must take what the schema returns,
 * since reply.success gets that data whichever format is sent. A renderer that does not is underlined
 */
type RenderersTakeJson<D> = D extends { responses: { 200: infer M } }
  ? M extends { "application/json": infer S extends AnySchema }
    ? {
        [K in keyof M]: K extends "application/json"
          ? never
          : M[K] extends (data: infer P) => unknown
            ? InferOutput<S> extends P
              ? never
              : K
            : never;
      }[keyof M] extends infer Wrong
      ? [Wrong] extends [never]
        ? unknown
        : {
            readonly responses: {
              readonly 200: {
                readonly [K in Wrong & PropertyKey]: "This renderer must take what the application/json schema returns";
              };
            };
          }
      : never
    : unknown
  : unknown;

/** redirect() goes under 303 only. Elsewhere its key is underlined with the reason */
type RedirectAt303<D> = D extends { responses: infer Rs }
  ? {
      [S in keyof Rs]: S extends 303
        ? never
        : Rs[S] extends RedirectResponse
          ? S
          : never;
    }[keyof Rs] extends infer Wrong
    ? [Wrong] extends [never]
      ? unknown
      : {
          readonly responses: {
            readonly [S in Wrong & PropertyKey]: "A redirect is always 303. Declare redirect() under 303";
          };
        }
    : never
  : unknown;

type AuthSetsCurrentUser<D> = D extends { auth: infer A }
  ? IsAny<EnvOf<A>> extends true
    ? {
        readonly auth: {
          readonly "auth's Env is any": "give it one, e.g. createMiddleware<{ Variables: { currentUser: CurrentUser } }>(...)";
        };
      }
    : EnvOf<A> extends { Variables: { currentUser: unknown } }
      ? unknown
      : {
          readonly auth: {
            readonly "auth must set currentUser": "a guard sets who is signed in: createMiddleware<{ Variables: { currentUser: CurrentUser } }>(...), or currentUser: null for anyone";
          };
        }
  : unknown;

/** The keys of request.param */
type ParamKeysOf<D> = D extends {
  request: { param: infer S extends AnySchema };
}
  ? keyof InferInput<S> & string
  : never;

/**
 * Every `:name` in the path must be a key of request.param, or its value is never validated.
 * When one is missing, registerEndpoint in routes.gen.ts is underlined with this message
 */
type ParamsDeclared<P extends string, D> = [
  Exclude<ParamKeys<P>, ParamKeysOf<D>>,
] extends [never]
  ? unknown
  : {
      readonly "path and request.param do not match": `The path params (${Exclude<ParamKeys<P>, ParamKeysOf<D>>}) of ${P} are missing from the keys of request.param`;
    };

/**
 * The hc type of an endpoint registered at that method and path.
 * routes.gen.ts joins these with & into the app's type, without chaining
 */
export type EndpointSchema<
  M extends RouteConfig["method"],
  P extends string,
  T,
> =
  T extends Endpoint<infer D>
    ? ToSchema<
        M,
        P,
        ComputeInput<BuiltRoute<AsRoute<D, M, P>>>,
        RouteConfigToTypedResponse<BuiltRoute<AsRoute<D, M, P>>>
      >
    : never;
