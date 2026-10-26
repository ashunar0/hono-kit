/**
 * The account: who is signed in, and only what the rules need. Here only the ID; add what your rules need
 * (a role, an organization: examples/invoices has both).
 * It is not the user record of the auth provider (email, name, ...). A business person (a member, a staff, a patient)
 * is a row of its own domain that holds the account's ID, and "only their own" reaches go through it.
 * Never put a business row's ID here: a session, once issued, would keep an old ID after the row is deleted.
 * Other domains borrow only types from here
 */

/**
 * The brand for account IDs. Mixing one up with a plain string is a type error.
 * Only accountId below may apply the brand
 */
declare const accountIdBrand: unique symbol;

export type AccountId = string & { readonly [accountIdBrand]: true };

/** Brands a string from outside or from the DB as an account ID. The only place that writes `as` */
export const accountId = (value: string) => value as AccountId;

/**
 * The brand. Its name is invisible outside this file, so a literal like `{ kind: "system" }`
 * cannot produce a branded value. Only authenticatedAccount below can create one
 */
declare const verified: unique symbol;

/** A signed-in account. Created only after authentication. Signed out is null, never an account with an empty ID */
export type Account = {
  readonly kind: "account";
  readonly id: AccountId;
  readonly [verified]: true;
};

/** Creates an authenticated account. Called only by the auth middleware (and tests) */
export const authenticatedAccount = (id: AccountId) => ({ kind: "account", id }) as Account;
