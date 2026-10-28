import { createMiddleware } from "hono/factory";
import { fail, guard, Unauthorized, type DepsVariables } from "hono-kit";

/**
 * The auth of this app. Rewrite these for your auth stack (what a CurrentUser holds, which guards exist);
 * how the session is read is sessionUser in deps. hono-kit fixes only that each endpoint names a guard in `auth`
 * and that it sets currentUser.
 */

/**
 * The brand for user IDs. Mixing one up with a plain string is a type error.
 * Only userId below may apply the brand (no-id-cast allows `as UserId` only in this file)
 */
declare const userIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: true };

/** Brands a string from outside or from the DB as a user ID */
export const userId = (value: string) => value as UserId;

/**
 * The brand. Its name is invisible outside this file, so a literal cannot produce a branded value.
 * Only authenticatedUser below can create one
 */
declare const verified: unique symbol;

/**
 * Who is signed in now: what the auth provider gives with the session (here id, name and email).
 * The app's own data about a person (a profile, a member) is a table of its own, read where it is needed.
 * Signed out is null, never a user with an empty ID
 */
export type CurrentUser = {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly [verified]: true;
};

/** Creates the signed-in user. Called only where the session is read (sessionUser in deps) and by tests */
export const authenticatedUser = (user: { id: UserId; name: string; email: string }) =>
  user as CurrentUser;

/**
 * Requires sign-in. Put it in an endpoint's auth (`auth: requireAuth`): it reads the session,
 * turns away a signed-out request with 401, and sets currentUser for the handler.
 * Unauthorized is added to responses automatically
 */
export const requireAuth = guard(
  [Unauthorized],
  createMiddleware<{ Variables: { currentUser: CurrentUser } & DepsVariables }>(
    async (c, next) => {
      const user = await c.var.deps.sessionUser(c.req.raw.headers);
      if (user === null) throw fail(Unauthorized);

      c.set("currentUser", user);
      await next();
    },
  ),
);

/**
 * Says explicitly that no auth is required. Lets everyone through, and currentUser is null (whoever it is).
 *
 * auth is required, so a public endpoint says so with `auth: allowAnonymous`.
 * grep it to list every unauthenticated endpoint in this app
 */
export const allowAnonymous = createMiddleware<{ Variables: { currentUser: null } }>(
  async (c, next) => {
    c.set("currentUser", null);
    await next();
  },
);
