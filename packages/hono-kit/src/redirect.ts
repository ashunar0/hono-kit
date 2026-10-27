/**
 * Redirects. Declared under 303 in responses (`303: redirect()`) and returned with reply.redirect(url).
 * Only the app's own paths are allowed unless the declaration names other origins, so a `next` from the query
 * cannot send people to another site (an open redirect)
 */

/** Marks a response declaration as a redirect */
export const REDIRECT: unique symbol = Symbol("hnk.redirect");

export type RedirectResponse = {
  readonly [REDIRECT]: { readonly origins: readonly string[] };
  readonly description: string;
};

/**
 * A redirect response. Put it under 303: `responses: { 303: redirect() }`.
 * To send people to another site, name its origin: `redirect({ origins: ["https://accounts.google.com"] })`
 */
export const redirect = (
  options: { origins?: readonly string[] } = {},
): RedirectResponse => {
  const origins = options.origins ?? [];
  return {
    [REDIRECT]: { origins },
    description:
      origins.length > 0
        ? `Redirects to this app or to ${origins.join(", ")}`
        : "Redirects within this app",
  };
};

export const isRedirect = (entry: unknown): entry is RedirectResponse =>
  typeof entry === "object" && entry !== null && REDIRECT in entry;

// A base no request comes from. A location that resolves to it is a path of this app
const SELF = "http://hnk.invalid";

/**
 * Returns the location if it may be redirected to, or throws (a redirect to somewhere undeclared is a bug, so 500).
 * The location is resolved the way browsers do, so `//evil.com` and `/\evil.com` count as other sites
 */
export const allowedLocation = (
  location: string,
  origins: readonly string[],
): string => {
  const resolved = URL.parse(location, SELF);
  if (resolved !== null) {
    if (resolved.origin === SELF) return location;
    if (origins.includes(resolved.origin)) return location;
  }
  throw new Error(
    `Redirect to ${location} is not allowed. Redirect to a path of this app ("/dashboard"), or declare the origin: redirect({ origins: ["https://..."] })`,
  );
};
