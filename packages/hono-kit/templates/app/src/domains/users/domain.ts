/**
 * The user. For now: who is signed in, which organization, which role.
 * Other modules' domains borrow only types from here.
 * The system (a caller with no user) belongs to hono-kit. cron, queues and webhooks receive it
 */
import type { System } from "hono-kit/system";

/** Role. admin can touch everything in their organization; member only their own */
export const roles = ["member", "admin"] as const;

export type Role = (typeof roles)[number];

/**
 * Brands for user and organization IDs. Mixing them up with a plain string or each other is a type error.
 * Only userId / orgId below may apply the brand
 */
declare const userIdBrand: unique symbol;
declare const orgIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: true };
export type OrgId = string & { readonly [orgIdBrand]: true };

/** Brands a string from outside or from the DB as a user ID. The only place that writes `as` */
export const userId = (value: string) => value as UserId;

/** Same, for organization IDs */
export const orgId = (value: string) => value as OrgId;

/**
 * The brand. Its name is invisible outside this file, so a literal like `{ kind: "system" }`
 * cannot produce a branded value. Only authenticatedUser below can create one
 */
declare const verified: unique symbol;

/** A signed-in user. Created only after authentication */
export type User = {
  readonly kind: "user";
  readonly id: UserId;
  /** The organization. Each user belongs to exactly one */
  readonly orgId: OrgId;
  readonly role: Role;
  readonly [verified]: true;
};

/** Creates an authenticated user. Called only by the auth middleware (and tests) */
export const authenticatedUser = (id: UserId, orgId: OrgId, role: Role) =>
  ({ kind: "user", id, orgId, role }) as User;

/**
 * Who is acting right now: a user or the system.
 * Over HTTP the guard (requireAuth, allowSystem) puts it in c.get("actor"); for cron and queues, createWorker passes it.
 * A service always takes "acting as whom" as its first argument
 */
export type Actor = User | System;
