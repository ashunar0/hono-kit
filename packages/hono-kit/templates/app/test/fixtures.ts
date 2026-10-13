import { env } from "cloudflare:workers";
import { wireDb } from "../src/db";
import { buildApp } from "../src/index";
import { makeDeps } from "../src/deps";
import { authenticatedUser, orgId, userId, type User } from "../src/domains/users/model";

export const db = () => wireDb(env.DB);

export const alice = authenticatedUser(userId("alice"), orgId("org1"), "member");
export const bob = authenticatedUser(userId("bob"), orgId("org1"), "member");
export const admin = authenticatedUser(userId("admin"), orgId("org1"), "admin");
/** Someone in another organization */
export const carol = authenticatedUser(userId("carol"), orgId("org2"), "member");

/**
 * The app, signed in as this user (real deps and D1).
 * null means signed out. Instead of an auth provider it just sets the session user; everything else is as in production
 */
export const appAs = (user: User | null) =>
  buildApp(makeDeps, async (c, next) => {
    c.set("user", user);
    await next();
  });

/** Send JSON through appAs. env points to the real D1 */
export const request = (user: User | null, method: string, path: string, body?: unknown) =>
  appAs(user).request(
    path,
    {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
