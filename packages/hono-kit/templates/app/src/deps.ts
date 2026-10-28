import { wireDb } from "./db";
import type { AppEnv } from "./env";
import type { CurrentUser } from "./middleware/auth";

/**
 * The one place that builds what handlers, middleware and jobs use (the composition root, like main in Go).
 *
 * buildApp receives how to build, not what was built. hono-kit's provideDeps calls it per request
 * and puts the result in c.var.deps (handlers, and middleware after it, read it there). For entry points that are not HTTP, createWorker calls it.
 * db is created per request: created at module scope, a connection-holding DB would be shared across requests.
 * Tests pass their own makeDeps to swap a part for a stand-in (a mailer that sends nothing, a signed-in user)
 */
export const makeDeps = (env: AppEnv["Bindings"]) => {
  const db = wireDb(env.DB);

  return {
    db,
    /**
     * Who the request's session belongs to, null when signed out. The guards in middleware/auth.ts call it.
     * TODO: read your auth provider's session here (the cookie in headers). Until then, this is always null
     */
    sessionUser: (_headers: Headers): Promise<CurrentUser | null> => Promise.resolve(null),
  };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hono-kit" {
  interface Register {
    deps: Deps;
  }
}
