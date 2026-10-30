/**
 * Who is signed in: read the session (a cookie in headers) with your auth provider and return the user, or null.
 * requireAuth calls it. Until it reads a session, every endpoint behind requireAuth answers 401 when called by hand
 */
export const sessionUser = (
  _headers: Headers,
): Promise<{ id: string; name: string; email: string } | null> => Promise.resolve(null);
