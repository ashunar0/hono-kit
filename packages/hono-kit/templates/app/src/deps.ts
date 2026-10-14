import { wireDb } from "./db";
import type { AppEnv } from "./env";
// hnk:imports

/**
 * The one place that gathers how domains are built (the composition root).
 *
 * buildApp receives how to build, not what was built. hono-kit's provideDeps
 * calls it per request (once, when a handler first receives it). For entry points that are not HTTP, createWorker calls it.
 * db is created per request: created at module scope, a connection-holding DB would be shared across requests.
 *
 * Build top to bottom with const. If a dependency is not written first, tsc stops with "used before its declaration".
 * So a dependency cycle between domains does not compile.
 * db itself is not returned, because entry points could then choose where to write.
 * `pnpm hnk g domain <name>` adds lines above the // hnk: lines
 */
export const makeDeps = (env: AppEnv["Bindings"]) => {
  const db = wireDb(env.DB);
  void db;
  // hnk:deps

  return {
    // hnk:returns
  };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hono-kit" {
  interface Register {
    deps: Deps;
  }
}
