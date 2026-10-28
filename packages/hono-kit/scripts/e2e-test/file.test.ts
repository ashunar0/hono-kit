import { openapiDocument } from "hono-kit/openapi";
import { expect, it } from "vitest";
import { buildApp } from "#src/main";
import { request } from "./fixtures";

it("sends the file as it is, with its type and the headers set on c", async () => {
  const res = await request(null, "GET", "/downloads?type=text%2Fcsv");

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("text/csv");
  expect(res.headers.get("Cache-Control")).toBe("max-age=60");
  expect(await res.text()).toBe("a,b\n1,2\n");
});

it("sends a file of unknown type as application/octet-stream", async () => {
  const res = await request(null, "GET", "/downloads");

  expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
});

it("lists the file in the OpenAPI document as binary", async () => {
  type Response = { content?: unknown; headers?: Record<string, unknown> };
  const doc = openapiDocument(buildApp(), { title: "e2e", version: "0" }) as unknown as {
    paths: Record<string, { get: { responses: Record<string, Response> } }>;
  };

  expect(doc.paths["/downloads"]?.get.responses["200"]?.content).toEqual({
    "application/octet-stream": { schema: { type: "string", format: "binary" } },
  });
  expect(doc.paths["/redirects"]?.get.responses["303"]?.headers?.Location).toBeDefined();
});
