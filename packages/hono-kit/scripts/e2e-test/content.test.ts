import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { appAs } from "./fixtures";

const get = (accept?: string) =>
  appAs(null).request("/greetings", { headers: accept === undefined ? {} : { Accept: accept } }, env);

it("sends HTML to a browser", async () => {
  const res = await get("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  expect(await res.text()).toBe("<p>Hello, hono</p>");
  expect(res.headers.get("Vary")).toContain("Accept");
});

it("sends Markdown to whoever asks for it first", async () => {
  const res = await get("text/markdown, text/html;q=0.5");

  expect(res.headers.get("Content-Type")).toMatch(/^text\/markdown/);
  expect(await res.text()).toBe("# Hello, hono");
});

it.each([undefined, "*/*"])("sends the first declared format (JSON) for Accept %s", async (accept) => {
  const res = await get(accept);

  expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
  expect(await res.json()).toEqual({ name: "hono" });
});

it("answers 406 when none of the formats is accepted", async () => {
  const res = await get("image/png");

  expect(res.status).toBe(406);
  expect(await res.json()).toEqual({
    error: { code: "NOT_ACCEPTABLE", message: "None of the accepted formats can be returned" },
  });
});

it("lists every format in the OpenAPI document", async () => {
  const res = await appAs(null).request("/openapi.json", {}, env);
  const doc = (await res.json()) as {
    paths: Record<string, { get: { responses: Record<string, { content?: Record<string, unknown> }> } }>;
  };

  expect(Object.keys(doc.paths["/greetings"]?.get.responses["200"]?.content ?? {})).toEqual([
    "application/json",
    "text/html",
    "text/markdown",
  ]);
});
