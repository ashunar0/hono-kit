import { expect, it } from "vitest";
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
  const res = await request(null, "GET", "/openapi.json");
  type Response = { content?: unknown; headers?: Record<string, unknown> };
  const doc = (await res.json()) as {
    paths: Record<string, { get: { responses: Record<string, Response> } }>;
  };

  expect(doc.paths["/downloads"]?.get.responses["200"]?.content).toEqual({
    "application/octet-stream": { schema: { type: "string", format: "binary" } },
  });
  expect(doc.paths["/redirects"]?.get.responses["303"]?.headers?.Location).toBeDefined();
});
