import { createApp } from "hono-kit";
import { sessionUser } from "./auth";
import { wireDb } from "./db/index";
import { registerRoutes } from "./routes.gen";

/** Opened once when the process starts, and shared by every request. vitest.config.ts points it to :memory: */
const db = wireDb(process.env.DATABASE_URL ?? "file:data.db");

/** What handlers, middleware and jobs read in c.var.deps. Tests swap parts of it */
export const makeDeps = () => ({ db, sessionUser });

export const buildApp = (deps = makeDeps, clock?: () => Date) => {
  const app = createApp({ makeDeps: deps, clock });
  // The app's own middleware (an error page, CORS, ...) goes here, before the routes
  registerRoutes(app);
  return app;
};
