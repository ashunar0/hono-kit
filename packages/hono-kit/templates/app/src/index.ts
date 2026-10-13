import type { MiddlewareHandler } from "hono";
import { createRouter, onError, provideDeps } from "hono-kit";
import { createWorker } from "hono-kit/worker";
import { openapiDocument } from "hono-kit/openapi";
import { makeDeps, type Deps } from "./deps";
import type { AppEnv } from "./env";
import { withUser } from "./middleware/auth";

/**
 * Builds the app. It takes how to build deps and how to decide the signed-in user from outside, so
 * production passes makeDeps and withUser, and tests pass stand-ins.
 * authenticate is the middleware that sets the session user (null when signed out). This is where an auth provider plugs in
 */
export const buildApp = (
  makeDeps: (env: AppEnv["Bindings"]) => Deps,
  authenticate: MiddlewareHandler<AppEnv> = withUser,
) => {
  const app = createRouter()
    .use("*", provideDeps(makeDeps))
    .use("*", authenticate)
    // Mount the top nouns here, one line each: .route("/invoices", invoicesRouter). Children go in their parent
    .onError(onError);

  // Built from the registered route declarations. Read on every request, so registration order does not matter
  app.get("/openapi.json", (c) =>
    c.json(openapiDocument(app, { title: "__APP_NAME__", version: "0.0.0" })),
  );

  return app;
};

export type ApiApp = ReturnType<typeof buildApp>;

const app = buildApp(makeDeps);

/**
 * The Workers entry point. HTTP goes to app.
 * To add cron or a queue, pass scheduled / queue here. Building deps, the actor (the system), now,
 * ack and retry are handled by createWorker
 */
export default createWorker({ makeDeps, fetch: app.fetch });
