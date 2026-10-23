import { env } from "cloudflare:workers";
import { wireDb } from "#src/db/index";
import { buildApp } from "#src/index";
import { makeDeps } from "#src/deps";
import { authenticatedAccount, accountId, type Account } from "#src/domains/accounts/model";

export const db = () => wireDb(env.DB);

export const alice = authenticatedAccount(accountId("alice"));
export const bob = authenticatedAccount(accountId("bob"));

/**
 * The app, signed in as this account (real deps and D1).
 * null means signed out. Instead of an auth provider it just sets the session's account; everything else is as in production.
 * at fixes c.get("now") (the real clock when omitted)
 */
export const appAs = (account: Account | null, at?: Date) =>
  buildApp(
    makeDeps,
    async (c, next) => {
      c.set("account", account);
      await next();
    },
    at ? () => at : undefined,
  );

/** Send JSON through appAs. env points to the real D1. at fixes the request's now */
export const request = (
  account: Account | null,
  method: string,
  path: string,
  body?: unknown,
  at?: Date,
) =>
  appAs(account, at).request(
    path,
    {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
