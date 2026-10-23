import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthVariables } from "#src/env";
import type { Role, Account } from "#src/domains/accounts/model";
import { defineAuth, fail, Forbidden, guard, Unauthorized } from "hono-kit";

/**
 * The auth of this app. Rewrite these for your auth stack (how the session is read, what an Account holds,
 * which guards exist): hono-kit fixes only that each endpoint names one in `auth` and that it sets actor.
 *
 * withAccount sets the session's account in the context (null when signed out). Lets signed-out requests through.
 *
 * TODO: once domains/auth/ decodes the cookie session,
 * set its result here. Until there is an auth provider, this is always null
 */
export const withAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("account", null);
  await next();
};

/**
 * Requires sign-in. Put it in an endpoint's auth (`auth: requireAuth`) and, in the handler after it,
 * actor (who is acting) becomes an Account (account itself still includes null).
 * Unauthorized is added to responses automatically
 */
export const requireAuth = defineAuth(
  guard(
    [Unauthorized],
    createMiddleware<{
      Variables: AuthVariables & { actor: Account };
    }>(async (c, next) => {
      const account = c.get("account");
      if (account === null) throw fail(Unauthorized);

      c.set("actor", account);
      await next();
    }),
  ),
);

/**
 * Requires sign-in as one of these roles. For a permission the role alone decides
 * (only an admin adds a member). When the rule needs the row (the author or an admin),
 * use requireAuth and decide it in service, all of it in one place.
 * Unauthorized and Forbidden are added to responses automatically
 */
export const requireRole = (...roles: Role[]) =>
  defineAuth(
    guard(
      [Unauthorized, Forbidden],
      createMiddleware<{
        Variables: AuthVariables & { actor: Account };
      }>(async (c, next) => {
        const account = c.get("account");
        if (account === null) throw fail(Unauthorized);
        if (!roles.includes(account.role)) throw fail(Forbidden);

        c.set("actor", account);
        await next();
      }),
    ),
  );

/**
 * Says explicitly that no auth is required. Does nothing.
 *
 * auth is required, so a public endpoint says so with `auth: allowAnonymous`.
 * grep it to list every unauthenticated endpoint in this app
 */
const doNothing: MiddlewareHandler<AppEnv> = (_c, next) => next();
export const allowAnonymous = defineAuth(doNothing);
