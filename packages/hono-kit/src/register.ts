import type { Env } from "hono";

/**
 * Where the app registers its types. In the file that defines AppEnv, write
 * `declare module "hono-kit" { interface Register { env: AppEnv } }`,
 * and in the composition file, `interface Register { deps: Deps }`
 */
export interface Register {}

export type RegisteredEnv = Register extends { env: infer E extends Env }
  ? E
  : Env;

export type RegisteredDeps = Register extends { deps: infer D }
  ? D
  : Record<string, never>;
