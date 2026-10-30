/**
 * Where the app's types reach hono-kit. `hnk prepare` writes, in src/routes.gen.ts,
 * `declare module "hono-kit" { interface Register { makeDeps: typeof makeDeps } }` from src/main.ts,
 * so the app never writes it. deps come from what makeDeps returns, the bindings from what it takes
 */
export interface Register {}

type MakeDeps = Register extends {
  makeDeps: infer M extends (env: never) => unknown;
}
  ? M
  : (env: object) => Record<string, never>;

export type RegisteredDeps = ReturnType<MakeDeps>;

/**
 * The bindings (D1, secrets, ...): what makeDeps takes.
 * A makeDeps that takes nothing (on Node, where the database is opened once at startup) reads no bindings
 */
export type RegisteredBindings = Parameters<MakeDeps> extends [infer Bindings, ...unknown[]]
  ? Bindings
  : object;

/**
 * What provideDeps puts in Hono's context: `c.var.deps`, in handlers and in middleware alike.
 * A middleware written with `createMiddleware<{ Variables: DepsVariables }>` reads it too
 */
export type DepsVariables = { deps: RegisteredDeps };

/** Set once per request by createApp. Handlers take now from here, never from new Date(), so tests can fix it */
export type ClockVariables = { now: Date };

/** The app's Env: its bindings, now and deps */
export type RegisteredEnv = {
  Bindings: RegisteredBindings;
  Variables: ClockVariables & DepsVariables;
};
