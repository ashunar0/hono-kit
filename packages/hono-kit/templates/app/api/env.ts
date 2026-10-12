import type { User } from "./modules/users/domain";

/** Context variables set by withUser. Defined once so handlers do not copy them */
export type AuthVariables = {
  /** The session user, or null when signed out. Handlers do not read it; the guard turns it into actor */
  user: User | null;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

declare module "hono-kit" {
  interface Register {
    env: AppEnv;
  }
}
