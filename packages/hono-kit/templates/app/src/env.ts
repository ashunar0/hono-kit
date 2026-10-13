import type { User } from "./domains/users/model";

/** Context variables set by withUser. Defined once so handlers do not copy them */
export type AuthVariables = {
  /** The session user, or null when signed out. Handlers do not read it; the guard turns it into actor */
  user: User | null;
};

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
