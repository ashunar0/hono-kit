import { env } from "cloudflare:workers";
import { createApp, errorPage, type SessionUser } from "hono-kit";
import { expect, it } from "vitest";
import { makeDeps } from "#src/main";
import { registerRoutes } from "#src/routes.gen";
import { alice } from "./fixtures";

/** The template's app with an error page: signed out goes to /login, the rest is a page */
const appWithErrorPage = (user: SessionUser | null) => {
  const app = createApp({
    makeDeps: (env) => ({ ...makeDeps(env), sessionUser: () => Promise.resolve(user) }),
  }).use(
    "*",
    errorPage((failure) =>
      failure.status === 401 ? { redirect: "/login" } : `<h1>${failure.status} ${failure.code}</h1>`,
    ),
  );
  registerRoutes(app);
  return app;
};

const html = { Accept: "text/html" };
const get = (user: SessionUser | null, path: string, headers: Record<string, string>) =>
  appWithErrorPage(user).request(path, { headers }, env);

it("shows the page for a declared failure", async () => {
  const res = await get(alice, "/pages/missing", html);

  expect(res.status).toBe(404);
  expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  expect(await res.text()).toBe("<h1>404 NOT_FOUND</h1>");
});

it("shows the page for an unexpected error", async () => {
  const res = await get(alice, "/pages/boom", html);

  expect(res.status).toBe(500);
  expect(await res.text()).toBe("<h1>500 INTERNAL</h1>");
});

it("sends a signed-out visitor to /login", async () => {
  const res = await get(null, "/pages/missing", html);

  expect(res.status).toBe(303);
  expect(res.headers.get("Location")).toBe("/login");
});

it("still answers JSON to whoever asks for JSON", async () => {
  const res = await get(alice, "/pages/missing", { Accept: "application/json" });

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
});

it("answers JSON from an endpoint that returns no HTML, even to a browser", async () => {
  const res = await get(alice, "/notes/x", html);

  expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
});
