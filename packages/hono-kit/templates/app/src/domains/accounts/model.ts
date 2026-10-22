/**
 * The account: who is signed in, and only what the rules need (here, the organization and the role).
 * It is not the user record of the auth provider (email, name, ...). A business person (a member, a staff, a patient)
 * is a row of its own domain that holds the account's ID, and "only their own" reaches go through it.
 * Never put a business row's ID here: a session, once issued, would keep an old ID after the row is deleted.
 * Other domains borrow only types from here.
 * The system (a caller with no account) belongs to hono-kit. cron, queues and webhooks receive it
 */
import type { System } from "hono-kit/system";

/** Role. admin can touch everything in their organization; member only their own */
export const roles = ["member", "admin"] as const;

export type Role = (typeof roles)[number];

/**
 * Brands for account and organization IDs. Mixing them up with a plain string or each other is a type error.
 * Only accountId / orgId below may apply the brand
 */
declare const accountIdBrand: unique symbol;
declare const orgIdBrand: unique symbol;

export type AccountId = string & { readonly [accountIdBrand]: true };
export type OrgId = string & { readonly [orgIdBrand]: true };

/** Brands a string from outside or from the DB as an account ID. The only place that writes `as` */
export const accountId = (value: string) => value as AccountId;

/** Same, for organization IDs */
export const orgId = (value: string) => value as OrgId;

/**
 * The brand. Its name is invisible outside this file, so a literal like `{ kind: "system" }`
 * cannot produce a branded value. Only authenticatedAccount below can create one
 */
declare const verified: unique symbol;

/** A signed-in account. Created only after authentication. Signed out is null, never an account with an empty ID */
export type Account = {
  readonly kind: "account";
  readonly id: AccountId;
  /** The organization. Each account belongs to exactly one */
  readonly orgId: OrgId;
  readonly role: Role;
  readonly [verified]: true;
};

/** Creates an authenticated account. Called only by the auth middleware (and tests) */
export const authenticatedAccount = (id: AccountId, orgId: OrgId, role: Role) =>
  ({ kind: "account", id, orgId, role }) as Account;

/**
 * Who is acting right now: an account or the system.
 * Over HTTP the guard in the endpoint's auth (requireAuth, allowSystem) puts it in c.get("actor"); for cron and queues, createWorker passes it.
 * A service always takes "acting as whom" as its first argument
 */
export type Actor = Account | System;
