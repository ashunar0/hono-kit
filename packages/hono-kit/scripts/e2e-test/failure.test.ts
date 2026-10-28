import { expect, it } from "vitest";
import { request } from "./fixtures";

const post = (kind: string) => request(null, "POST", "/statuses", { kind });

it("sends the details a failure declares", async () => {
  const res = await post("over");

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({
    error: { code: "OVER_LIMIT", message: "Over the limit", details: { limit: 3, requested: 5 } },
  });
});

it("sends no details for a failure that declares none", async () => {
  const res = await post("taken");

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: "TAKEN", message: "Taken" } });
});

it("shows each failure with details as its own branch in the OpenAPI document", async () => {
  const res = await request(null, "GET", "/openapi.json");
  type Schema = { properties: { error: { oneOf: Record<string, unknown>[] } } };
  const doc = (await res.json()) as {
    paths: Record<string, { post: { responses: Record<string, { content: Record<string, { schema: Schema }> }> } }>;
  };

  const conflict = doc.paths["/statuses"]?.post.responses["409"]?.content["application/json"]?.schema;
  expect(conflict?.properties.error.oneOf).toEqual([
    {
      type: "object",
      properties: {
        code: { type: "string", enum: ["TAKEN", "STARTING"] },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
    {
      type: "object",
      properties: {
        code: { type: "string", enum: ["OVER_LIMIT"] },
        message: { type: "string" },
        details: expect.objectContaining({
          type: "object",
          properties: { limit: { type: "number" }, requested: { type: "number" } },
        }),
      },
      required: ["code", "message", "details"],
    },
  ]);
});
