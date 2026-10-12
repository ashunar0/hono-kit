import { expect, it } from "vitest";
import { alice, request } from "./fixtures";

it("returns the OpenAPI document", async () => {
  const res = await request(alice, "GET", "/openapi.json");

  expect(res.status).toBe(200);
});
