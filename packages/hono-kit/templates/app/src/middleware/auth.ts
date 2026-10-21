import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthVariables } from "#src/env";
import type { Role, User } from "#src/domains/users/model";
import { fail, Forbidden, guard, Unauthorized } from "hono-kit";

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
 * Requires sign-in. Put it in an endpoint's middleware and, in the handler after it,
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
 * Requires sign-in as one of these roles. For a permission the role alone decides
 * (only an admin adds a member). When the rule needs the row (the author or an admin),
 * use requireAuth and decide it in service, all of it in one place.
 * Unauthorized and Forbidden are added to responses automatically
 */
export const requireRole = (...roles: Role[]) =>
  guard(
    [Unauthorized, Forbidden],
    createMiddleware<{
      Variables: AuthVariables & { actor: User };
    }>(async (c, next) => {
      const user = c.get("user");
      if (user === null) throw fail(Unauthorized);
      if (!roles.includes(user.role)) throw fail(Forbidden);

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
