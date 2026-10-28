import type { Env } from "hono";

/**
 * Where the app registers its types. In the file that defines AppEnv, write
 * `declare module "hono-kit" { interface Register { env: AppEnv } }`,
 * and in the composition file, `interface Register { deps: Deps }`
 */
export interface Register {}

export type RegisteredDeps = Register extends { deps: infer D }
  ? D
  : Record<string, never>;

/**
 * What provideDeps puts in Hono's context: `c.var.deps`, in handlers and in middleware alike.
 * A middleware written with `createMiddleware<{ Variables: DepsVariables }>` reads it too
 */
export type DepsVariables = { deps: RegisteredDeps };

/** The app's Env, with deps added to its Variables */
export type RegisteredEnv = (Register extends { env: infer E extends Env }
  ? E
  : Env) & { Variables: DepsVariables };
