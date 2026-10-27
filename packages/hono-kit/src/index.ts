/**
 * Entry point of hono-kit. The contents live in one file per role.
 * - endpoint.ts + router.ts: endpoint declarations and handlers (createEndpoint, registerEndpoint, reply, guard, provideDeps)
 * - failure.ts: failures returned over HTTP (httpError, fail, onError)
 * - entry.ts: what non-HTTP entry points receive (cron, queue), whatever runs them
 * - worker.ts: the Cloudflare Workers entry point (createWorker). Imported from "hono-kit/worker", not from here,
 *   so the rest of hono-kit knows nothing of Workers
 * - content.ts: one response in several formats (JSON, HTML, ...), chosen by Accept
 * - error-page.ts: the app's one error page (errorPage), for HTML requests to pages
 * - file.ts: file responses (file), sent as they are
 * - redirect.ts: redirect responses (redirect) and which locations they may go to
 * - page-schema.ts: HTTP input/output shapes for list pagination
 */
export { err, ok, type Result } from "./result.js";
export type { Cursor, Page, PageQuery } from "./page.js";

export type { Register } from "./register.js";
export { errorResponses, guard, provideDeps, type Guard } from "./endpoint.js";
export {
  createEndpoint,
  createApp,
  registerEndpoint,
  type Endpoint,
  type EndpointDeclaration,
  type EndpointSchema,
} from "./router.js";
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
  NotAcceptable,
  onError,
  ValidationError,
  type AnyFailure,
  type HttpError,
} from "./failure.js";
export { type CronContext, type QueueContext, runScheduled } from "./entry.js";
export { type ContentMap, type Rendered, type Renderer } from "./content.js";
export {
  errorPage,
  type ErrorPageResult,
  type ShownFailure,
} from "./error-page.js";
export { file, type FileBody, type FileResponse } from "./file.js";
export { redirect, type RedirectResponse } from "./redirect.js";
export {
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
} from "./page-schema.js";
