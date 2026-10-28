/** Set once per request by buildApp. Handlers take now from here, never from new Date(), so tests can fix it */
export type ClockVariables = {
  now: Date;
};

/** currentUser is not here: the guard in each endpoint's auth sets it, typed for that endpoint */
export type AppEnv = {
  Bindings: Env;
  Variables: ClockVariables;
};

declare module "hono-kit" {
  interface Register {
    env: AppEnv;
  }
}
