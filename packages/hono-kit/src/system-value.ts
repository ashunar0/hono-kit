import type { System } from "./system.js";

/**
 * The system value. Only createWorker and allowSystem inside hono-kit hand it out. Tests borrow it from hono-kit/testing.
 * The type (system.ts) and the value live in separate files so that `hono-kit/system` exports only the type.
 * The value is not in package.json exports; only hono-kit itself and `hono-kit/testing` (for tests) have it
 */
export const systemActor = { kind: "system" } as System;
