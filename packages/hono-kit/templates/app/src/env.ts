import type { AuthVariables } from "#src/middleware/auth";

/** Set once per request by buildApp. Handlers take now from here, never from new Date(), so tests can fix it */
export type ClockVariables = {
  now: Date;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AuthVariables & ClockVariables;
};

declare module "hono-kit" {
  interface Register {
    env: AppEnv;
  }
}
