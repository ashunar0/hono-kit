import { createMiddleware } from "hono/factory";
import { guard } from "./endpoint.js";
import { fail } from "./failure.js";
import { Unauthorized } from "./failures.js";
import type { DepsVariables, RegisteredDeps } from "./register.js";

/**
 * Who may call an endpoint: `requireAuth` and `allowAnonymous`, and who is signed in (`CurrentUser`).
 * The app writes only how its auth provider reads the session: `sessionUser(headers)` in makeDeps,
 * which returns the signed-in user (`{ id, ... }`, what the provider gives) or null.
 * Guards the app adds (`requireRole("admin")`) read the user with getCurrentUser, as requireAuth does
 */

declare const userIdBrand: unique symbol;

/** A user's ID. Mixing one up with another ID (an expense's) is a type error */
export type UserId = string & { readonly [userIdBrand]: true };

/** Brands a string from outside or from the DB as a user ID. The only `as UserId` (no-id-cast) */
export const userId = (value: string) => value as UserId;

/** What sessionUser returns for a signed-in user, as the provider gives it. Tests sign in with one of these */
export type SessionUser = RegisteredDeps extends {
  sessionUser: (headers: Headers) => Promise<infer U>;
}
  ? NonNullable<U>
  : never;

/**
 * The brand. Its name is invisible outside this file, so only requireAuth makes a CurrentUser:
 * a user made by hand (from a request body) cannot be passed where the signed-in user is expected
 */
declare const verified: unique symbol;

/**
 * Who is signed in now: what sessionUser returned, with its id as a UserId.
 * The app's own data about a person (a profile, a member) is a table of its own, read where it is needed
 */
export type CurrentUser = [SessionUser] extends [never]
  ? never
  : {
      readonly [K in keyof SessionUser]: K extends "id"
        ? UserId
        : SessionUser[K];
    } & { readonly [verified]: true };

type ReadsSession = {
  sessionUser?: (headers: Headers) => Promise<unknown>;
};

/**
 * Reads the session with deps' sessionUser: the signed-in CurrentUser, or null. The only way to make a CurrentUser.
 * For guards (requireAuth, and the ones the app adds). A handler reads `c.var.currentUser`, which its guard set,
 * instead of reading the session again
 */
export const getCurrentUser = async (c: {
  var: DepsVariables;
  req: { raw: Request };
}): Promise<CurrentUser | null> => {
  const { sessionUser } = c.var.deps as ReadsSession;
  if (sessionUser === undefined)
    throw new Error(
      "Reading the session needs deps.sessionUser(headers). Return it from makeDeps in src/main.ts",
    );
  return ((await sessionUser(c.req.raw.headers)) ?? null) as CurrentUser | null;
};

/**
 * Requires sign-in: `auth: requireAuth`. It reads the session with deps' sessionUser,
 * turns away a signed-out request with 401, and sets currentUser for the handler.
 * Unauthorized is added to responses automatically
 */
export const requireAuth = guard(
  [Unauthorized],
  createMiddleware<{ Variables: { currentUser: CurrentUser } & DepsVariables }>(
    async (c, next) => {
      const user = await getCurrentUser(c);
      if (user === null) throw fail(Unauthorized);

      c.set("currentUser", user);
      await next();
    },
  ),
);

/**
 * Says explicitly that no auth is required: `auth: allowAnonymous`. Lets everyone through, and currentUser is null.
 * grep it to list every endpoint anyone may call
 */
export const allowAnonymous = createMiddleware<{
  Variables: { currentUser: null };
}>(async (c, next) => {
  c.set("currentUser", null);
  await next();
});
