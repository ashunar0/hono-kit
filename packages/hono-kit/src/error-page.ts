/**
 * The app's one error page. `app.use("*", errorPage((failure) => ...))` in src/main.ts, before registerRoutes(app).
 * It is shown only when the client asked for HTML and the endpoint returns HTML; everyone else still gets the JSON failure.
 * Both ways a failure leaves are covered: reply.failure in the handler, and what is thrown before it (401, 400, 406) or by mistake (500)
 */
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { negotiate, isContentMap, type Rendered } from "./content.js";
import { allowedLocation } from "./redirect.js";
import type { RouteConfig } from "./route-types.js";

/** What the page is told about the failure */
export type ShownFailure = { code: string; status: number; message: string };

/** A page, or somewhere to send people instead (`{ redirect: "/login" }`, a path of this app) */
export type ErrorPageResult = Rendered | { redirect: string };

type Render = (failure: ShownFailure) => ErrorPageResult;

// Kept per request rather than in c's variables, so they do not show up in the app's Env
const renders = new WeakMap<Request, Render>();
const formats = new WeakMap<Request, string>();

/** Registers the error page for the requests below it */
export const errorPage =
  (render: Render): MiddlewareHandler =>
  async (c, next) => {
    renders.set(c.req.raw, render);
    await next();
  };

/** Remembers which format this endpoint will answer in, before auth runs, so a 401 knows it is for a page */
export const rememberFormat =
  (route: RouteConfig): MiddlewareHandler =>
  async (c, next) => {
    const success = route.responses[200];
    const format = isContentMap(success)
      ? negotiate(c.req.header("Accept"), Object.keys(success))
      : undefined;
    if (format !== undefined) formats.set(c.req.raw, format);
    await next();
  };

/** The error page for this failure, or undefined when JSON should be sent (no page, or not an HTML request) */
export const errorPageFor = async (
  c: Context,
  failure: ShownFailure,
): Promise<Response | undefined> => {
  const render = renders.get(c.req.raw);
  if (render === undefined || formats.get(c.req.raw) !== "text/html")
    return undefined;

  const result = await render(failure);
  if (typeof result === "object" && "redirect" in result)
    return c.redirect(allowedLocation(result.redirect, []), 303);
  return c.html(result, failure.status as ContentfulStatusCode);
};
