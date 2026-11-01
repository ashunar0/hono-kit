import { createApp, type SessionUser } from "hono-kit";
import { afterEach, expect, it, vi } from "vitest";
import { makeDeps } from "#/main";
import { registerRoutes } from "#/routes.gen";
import { alice } from "./fixtures";
import { env } from "./bindings";

/** The template's app, signed in as alice */
const app = () => {
  const app = createApp({
    makeDeps: (...args: Parameters<typeof makeDeps>) => ({
      ...makeDeps(...args),
      sessionUser: () => Promise.resolve<SessionUser>(alice),
    }),
  });
  registerRoutes(app);
  return app;
};

afterEach(() => {
  vi.restoreAllMocks();
});

it("logs an unexpected error as one JSON line with the method, the route and the ray", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const res = await app().request("/pages/boom", { headers: { "cf-ray": "8f2a-NRT" } }, env);

  expect(res.status).toBe(500);
  expect(log).toHaveBeenCalledTimes(1);
  const line = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(line).toMatchObject({
    level: "error",
    kind: "unhandled",
    method: "GET",
    route: "/pages/:id",
    ray: "8f2a-NRT",
  });
  expect(line.error).toContain("boom");
});

it("does not log a declared failure", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const res = await app().request("/pages/missing", {}, env);

  expect(res.status).toBe(404);
  expect(log).not.toHaveBeenCalled();
});
