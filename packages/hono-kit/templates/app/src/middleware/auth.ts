import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthVariables } from "../env";
import type { User } from "../domains/users/domain";
import { fail, guard, Unauthorized } from "hono-kit";

/**
 * Sets the session user in the context. Lets signed-out requests through.
 *
 * TODO: once domains/auth/ decodes the cookie session,
 * set its result here. Until there is an auth provider, this is always null
 */
export const withUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  await next();
};

/**
 * Requires sign-in. Put it in .endpoint middleware and, in the handler after it,
 * actor (who is acting) becomes a User (user itself still includes null).
 * Unauthorized is added to responses automatically
 */
export const requireAuth = guard(
  [Unauthorized],
  createMiddleware<{
    Variables: AuthVariables & { actor: User };
  }>(async (c, next) => {
    const user = c.get("user");
    if (user === null) throw fail(Unauthorized);

    c.set("actor", user);
    await next();
  }),
);

/**
 * Says explicitly that no auth is required. Does nothing.
 *
 * It exists so every endpoint declares exactly one auth guard. It separates forgetting from
 * "meant to be public", which would otherwise look the same. grep it to list
 * every unauthenticated endpoint in this app
 */
export const allowAnonymous: MiddlewareHandler<AppEnv> = (_c, next) => next();
