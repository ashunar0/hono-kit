/**
 * Entry point of hono-kit. The contents live in one file per role.
 * - endpoint.ts + router.ts: route declarations and handlers (createRouter, reply, guard, provideDeps)
 * - failure.ts: failures returned over HTTP (httpError, fail, onError)
 * - worker.ts: the Workers entry point (createWorker) and what non-HTTP entry points receive
 * - page-schema.ts: HTTP input/output shapes for list pagination
 */
export { err, ok, type Result } from "./result.js";
export type { System } from "./system.js";
export type { Cursor, Page, PageQuery } from "./page.js";

export type { Register } from "./register.js";
export { errorResponses, guard, provideDeps, type Guard } from "./endpoint.js";
export { createRouter } from "./router.js";
export {
  Forbidden,
  NotFound,
  Unauthorized,
  type Failure,
  type FailureKind,
} from "./failures.js";
export {
  fail,
  httpError,
  onError,
  ValidationError,
  type AnyFailure,
  type HttpError,
} from "./failure.js";
export {
  allowSystem,
  createWorker,
  type CronContext,
  type QueueContext,
} from "./worker.js";
export {
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
} from "./page-schema.js";
