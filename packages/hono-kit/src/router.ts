import {
  Hono,
  type Env,
  type Handler,
  type Input,
  type Schema,
  type ToSchema,
} from "hono";
import { validator } from "hono/validator";
import type { MergePath } from "hono/types";
import {
  buildEndpoint,
  type BuiltRoute,
  type EndpointConfig,
  type EndpointFn,
} from "./endpoint.js";
import { fail, ValidationError } from "./failure.js";
import type { RegisteredEnv } from "./register.js";
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

const validatorsOf = (route: RouteConfig) => {
  const { param, query, header, cookie, json } = route.request ?? {};

  return [
    param && check("param", param),
    query && check("query", query),
    header && check("header", header),
    cookie && check("cookie", cookie),
    json && check("json", json),
  ].filter((v): v is NonNullable<typeof v> => !!v);
};

/**
 * A Hono that groups routes. `.endpoint(config, fn)` registers a declaration together with its handler.
 * The declaration determines the types of c.req.valid() and of hc responses
 */
export class Router<
  E extends Env = Env,
  S extends Schema = {},
  BasePath extends string = "/",
> extends Hono<E, S, BasePath> {
  endpoint<const C extends RouteConfig>(
    config: EndpointConfig<C>,
    fn: EndpointFn<C>,
  ): Router<
    E,
    S &
      ToSchema<
        C["method"],
        MergePath<BasePath, C["path"]>,
        ComputeInput<BuiltRoute<C>>,
        RouteConfigToTypedResponse<BuiltRoute<C>>
      >,
    BasePath
  > {
    const [route, handler] = buildEndpoint(config as C, fn);
    const middleware = [route.middleware ?? []].flat();
    const last = Object.assign(handler, { [ROUTE]: route });

    // Types are guarded by the parameter declarations. Hono's on cannot match them up in here
    (
      (this as unknown as Hono<any, any, any>).on as (
        ...args: unknown[]
      ) => unknown
    ).call(
      this,
      route.method.toUpperCase(),
      route.path,
      ...([...middleware, ...validatorsOf(route), last] as unknown[]),
    );

    return this as never;
  }
}

/** A Hono that groups routes. Use instead of `new Hono()` */
export const createRouter = () => new Router<RegisteredEnv>();
