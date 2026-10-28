import { wireDb } from "./db";
import type { AppEnv } from "./env";

/**
 * The one place that builds what handlers, middleware and jobs use (the composition root, like main in Go).
 *
 * buildApp receives how to build, not what was built. hono-kit's provideDeps calls it per request
 * and puts the result in c.var.deps (handlers, and middleware after it, read it there). For entry points that are not HTTP, createWorker calls it.
 * db is created per request: created at module scope, a connection-holding DB would be shared across requests.
 * Tests pass their own makeDeps to swap a part for a stand-in (a mailer that sends nothing)
 */
export const makeDeps = (env: AppEnv["Bindings"]) => {
  const db = wireDb(env.DB);

  return { db };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hono-kit" {
  interface Register {
    deps: Deps;
  }
}
