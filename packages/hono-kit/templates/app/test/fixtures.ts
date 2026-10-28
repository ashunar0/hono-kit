import { env } from "cloudflare:workers";
import type { SessionUser } from "hono-kit";
import { wireDb } from "#/db/index";
import { buildApp, makeDeps } from "#/main";

export const db = () => wireDb(env.DB);

export const alice: SessionUser = { id: "alice", name: "Alice", email: "alice@example.com" };
export const bob: SessionUser = { id: "bob", name: "Bob", email: "bob@example.com" };

/**
 * A new user nobody else has used. The tests in a file share one D1, so a test that reads a list
 * starts with its own user instead of alice, whose rows other tests leave behind
 */
export const someone = (): SessionUser => {
  const id = crypto.randomUUID();
  return { id, name: "Someone", email: `${id}@example.com` };
};

/**
 * The app, signed in as this user (real deps and D1). null means signed out.
 * sessionUser just returns the user; everything else is as in production. at fixes c.get("now")
 */
export const appAs = (user: SessionUser | null, at?: Date) =>
  buildApp(
    (env) => ({ ...makeDeps(env), sessionUser: () => Promise.resolve(user) }),
    at ? () => at : undefined,
  );

/** Send JSON through appAs. env points to the real D1. at fixes the request's now */
export const request = (
  user: SessionUser | null,
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
