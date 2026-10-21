import type { MiddlewareHandler } from "hono";
import { createApp, onError, provideDeps } from "hono-kit";
import { createWorker } from "hono-kit/worker";
import { openapiDocument } from "hono-kit/openapi";
import { makeDeps, type Deps } from "./deps";
import type { AppEnv } from "./env";
import { withUser } from "./middleware/auth";
import { registerRoutes } from "./routes.gen";

/**
 * Builds the app. It takes how to build deps, how to decide the signed-in user and the clock from outside, so
 * production passes makeDeps and withUser, and tests pass stand-ins.
 * authenticate is the middleware that sets the session user (null when signed out). This is where an auth provider plugs in.
 * clock is read once per request into c.get("now"). Tests pass a fixed time
 */
export const buildApp = (
  makeDeps: (env: AppEnv["Bindings"]) => Deps,
  authenticate: MiddlewareHandler<AppEnv> = withUser,
  clock: () => Date = () => new Date(),
) => {
  const app = createApp()
    .use("*", async (c, next) => {
      c.set("now", clock());
      await next();
    })
    .use("*", provideDeps(makeDeps))
    .use("*", authenticate)
    .onError(onError);

  // Every endpoint under src/routes. routes.gen.ts is written by pnpm hnk gen (pnpm check runs it first)
  registerRoutes(app);

  // Built from the registered route declarations. Read on every request, so registration order does not matter
  app.get("/openapi.json", (c) =>
    c.json(openapiDocument(app, { title: "__APP_NAME__", version: "0.0.0" })),
  );

  return app;
};

/** The type to pass to hc. routes.gen.ts lists every endpoint side by side */
export type { AppType as ApiApp } from "./routes.gen";

const app = buildApp(makeDeps);

/**
 * The Workers entry point. HTTP goes to app.
 * To add cron or a queue, write the job in src/jobs/ and pass scheduled / queue here. Building deps, the actor (the system), now,
 * ack and retry are handled by createWorker
 */
export default createWorker({ makeDeps, fetch: app.fetch });
