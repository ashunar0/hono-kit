import { createApp } from "hono-kit";
import { createWorker } from "hono-kit/worker";
import { sessionUser } from "./auth";
import { wireDb } from "./db/index";
import { registerRoutes } from "./routes.gen";

/** What handlers, middleware and jobs read in c.var.deps. Built per request; tests swap parts of it */
export const makeDeps = (env: Env) => ({ db: wireDb(env.DB), sessionUser });

export const buildApp = (deps = makeDeps, clock?: () => Date) => {
  const app = createApp({ makeDeps: deps, clock });
  // The app's own middleware (an error page, CORS, ...) goes here, before the routes
  registerRoutes(app);
  return app;
};

export default createWorker({ makeDeps, fetch: buildApp().fetch });
