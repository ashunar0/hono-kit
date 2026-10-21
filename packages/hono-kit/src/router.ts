import { Hono, type MiddlewareHandler, type ToSchema } from "hono";
import { validator } from "hono/validator";
import type { H, ParamKeys } from "hono/types";
import { buildEndpoint, type BuiltRoute, type EndpointFn } from "./endpoint.js";
import { fail, ValidationError } from "./failure.js";
import type { RegisteredEnv } from "./register.js";
import type { InferInput } from "./standard-schema.js";
import type {
  AnySchema,
  ComputeInput,
  RouteConfig,
  RouteConfigToTypedResponse,
} from "./route-types.js";

/** Attaches the declaration to the handler. The OpenAPI document is built by reading it from registered handlers */
export const ROUTE: unique symbol = Symbol("hnk.route");

/** Input validation. Anything that implements Standard Schema. Failures go to onError as ValidationError */
const check = (
  target: "param" | "query" | "header" | "cookie" | "json",
  schema: AnySchema,
) =>
  validator(target, async (value) => {
    const result = await schema["~standard"].validate(value);
    if (result.issues) throw fail(ValidationError, result.issues[0]?.message);

    return result.value;
  });

/** application/json and application/*+json, with optional parameters (charset, ...) */
const JSON_CONTENT_TYPE = /^application\/([a-z0-9.-]+\+)?json(\s*;.*)?$/i;

/**
 * Rejects a body that is not declared as JSON. Without a JSON Content-Type, Hono does not read the body
 * and hands {} to the validator, so a schema whose fields are all optional would accept any body as {}
 */
const requireJsonBody: MiddlewareHandler = async (c, next) => {
  if (!JSON_CONTENT_TYPE.test(c.req.header("content-type") ?? "")) {
    throw fail(ValidationError, "Content-Type must be application/json");
  }
  await next();
};

const validatorsOf = (route: RouteConfig) => {
  const { param, query, header, cookie, json } = route.request ?? {};

  return [
    param && check("param", param),
    query && check("query", query),
    header && check("header", header),
    cookie && check("cookie", cookie),
    json && requireJsonBody,
    json && check("json", json),
  ].filter((v): v is NonNullable<typeof v> => !!v);
};

/**
 * The app's root. Use instead of `new Hono()`, so c.get / c.set know the app's Env (Register).
 * The return type is written out so the published .d.ts keeps RegisteredEnv instead of resolving it to Env
 */
export const createApp = (): Hono<RegisteredEnv> =>
  new Hono<RegisteredEnv>();

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
 * The handlers to register, in order (middleware, input validation, the handler). The declaration rides along in the type.
 * The brand is required, not just carried: a plain `H[]` built by hand (no auth, no responses contract) must not
 * type-check where an Endpoint is expected. Only createEndpoint may produce one
 */
export type Endpoint<D extends EndpointDeclaration> = readonly H[] & {
  readonly [DECLARATION]: D;
};

/**
 * One endpoint. `export const GET = createEndpoint({ request, responses }, async (c, reply, deps) => ...)`.
 * routes.gen.ts registers it with registerEndpoint
 */
export const createEndpoint = <const D extends EndpointDeclaration>(
  config: D,
  fn: EndpointFn<AsRoute<D>>,
): Endpoint<D> => {
  const [route, handler] = buildEndpoint(config as AsRoute<D>, fn);
  const middleware = [route.middleware ?? []].flat();

  // DECLARATION is a brand with no runtime value: nothing to assign, only to assert
  return [
    ...middleware,
    ...validatorsOf(route),
    Object.assign(handler, { [ROUTE]: route }),
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
