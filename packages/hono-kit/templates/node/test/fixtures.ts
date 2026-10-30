import type { SessionUser } from "hono-kit";
import { buildApp, makeDeps } from "#/main";

export const db = () => makeDeps().db;

export const alice: SessionUser = { id: "alice", name: "Alice", email: "alice@example.com" };
export const bob: SessionUser = { id: "bob", name: "Bob", email: "bob@example.com" };

/**
 * A new user nobody else has used. The tests in a file share one database, so a test that reads a list
 * starts with its own user instead of alice, whose rows other tests leave behind
 */
export const someone = (): SessionUser => {
  const id = crypto.randomUUID();
  return { id, name: "Someone", email: `${id}@example.com` };
};

/**
 * The app, signed in as this user (real deps and database). null means signed out.
 * sessionUser just returns the user; everything else is as in production. at fixes c.get("now")
 */
export const appAs = (user: SessionUser | null, at?: Date) =>
  buildApp(
    () => ({ ...makeDeps(), sessionUser: () => Promise.resolve(user) }),
    at ? () => at : undefined,
  );

/** Send JSON through appAs. at fixes the request's now */
export const request = (
  user: SessionUser | null,
  method: string,
  path: string,
  body?: unknown,
  at?: Date,
) =>
  appAs(user, at).request(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
