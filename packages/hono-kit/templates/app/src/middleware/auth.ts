import { createMiddleware } from "hono/factory";
import { fail, guard, Unauthorized, type DepsVariables } from "hono-kit";

/**
 * The auth of this app. Rewrite these for your auth stack (how the session is read, what an Account holds,
 * which guards exist): hono-kit fixes only that each endpoint names one in `auth` and that it sets actor.
 */

/**
 * The brand for account IDs. Mixing one up with a plain string is a type error.
 * Only accountId below may apply the brand (no-id-cast allows `as AccountId` only in this file)
 */
declare const accountIdBrand: unique symbol;

export type AccountId = string & { readonly [accountIdBrand]: true };

/** Brands a string from outside or from the DB as an account ID */
export const accountId = (value: string) => value as AccountId;

/**
 * The brand. Its name is invisible outside this file, so a literal cannot produce a branded value.
 * Only authenticatedAccount below can create one
 */
declare const verified: unique symbol;

/**
 * Who is signed in, and only what the rules need. Here only the ID; add what your rules need (a role, an organization).
 * It is not the user record of the auth provider (email, name, ...). Signed out is null, never an account with an empty ID
 */
export type Account = {
  readonly kind: "account";
  readonly id: AccountId;
  readonly [verified]: true;
};

/** Creates an authenticated account. Called only by the auth middleware (and tests) */
export const authenticatedAccount = (id: AccountId) => ({ kind: "account", id }) as Account;

/** Context variables set by withAccount */
export type AuthVariables = {
  /** The session's account, or null when signed out. Handlers do not read it; the guard turns it into actor */
  account: Account | null;
};

/**
 * Sets the session's account in the context (null when signed out). Lets signed-out requests through.
 *
 * TODO: once the auth provider decodes the cookie session, set its result here. Until then, this is always null.
 * deps are in c.var.deps, for an auth provider that reads the database (build it in makeDeps)
 */
export const withAccount = createMiddleware<{ Variables: AuthVariables & DepsVariables }>(async (c, next) => {
  c.set("account", null);
  await next();
});

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
