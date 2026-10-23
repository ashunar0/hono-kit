import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthVariables } from "#src/env";
import type { Account } from "#src/domains/accounts/model";
import { fail, guard, Unauthorized } from "hono-kit";

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
export const requireAuth = guard(
  [Unauthorized],
  createMiddleware<{
    Variables: AuthVariables & { actor: Account };
  }>(async (c, next) => {
    const account = c.get("account");
    if (account === null) throw fail(Unauthorized);

    c.set("actor", account);
    await next();
  }),
);

/**
 * Says explicitly that no auth is required. Lets everyone through, and actor is null (whoever it is).
 *
 * auth is required, so a public endpoint says so with `auth: allowAnonymous`.
 * grep it to list every unauthenticated endpoint in this app
 */
export const allowAnonymous = createMiddleware<{ Variables: { actor: null } }>(async (c, next) => {
  c.set("actor", null);
  await next();
});
