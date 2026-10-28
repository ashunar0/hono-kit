import { env } from "cloudflare:workers";
import { wireDb } from "#src/db/index";
import { buildApp } from "#src/index";
import { makeDeps } from "#src/deps";
import { authenticatedUser, userId, type CurrentUser } from "#src/middleware/auth";

export const db = () => wireDb(env.DB);

export const alice = authenticatedUser({
  id: userId("alice"),
  name: "Alice",
  email: "alice@example.com",
});
export const bob = authenticatedUser({ id: userId("bob"), name: "Bob", email: "bob@example.com" });

/**
 * A new user nobody else has used. The tests in a file share one D1, so a test that reads a list
 * starts with its own user instead of alice, whose rows other tests leave behind
 */
export const someone = () => {
  const id = crypto.randomUUID();
  return authenticatedUser({ id: userId(id), name: "Someone", email: `${id}@example.com` });
};

/**
 * The app, signed in as this user (real deps and D1).
 * null means signed out. Instead of an auth provider, sessionUser just returns the user; everything else is as in production.
 * at fixes c.get("now") (the real clock when omitted)
 */
export const appAs = (user: CurrentUser | null, at?: Date) =>
  buildApp(
    (env) => ({ ...makeDeps(env), sessionUser: () => Promise.resolve(user) }),
    at ? () => at : undefined,
  );

/** Send JSON through appAs. env points to the real D1. at fixes the request's now */
export const request = (
  user: CurrentUser | null,
  method: string,
  path: string,
  body?: unknown,
  at?: Date,
) =>
  appAs(user, at).request(
    path,
    {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
