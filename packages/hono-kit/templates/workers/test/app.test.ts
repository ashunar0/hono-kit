import { expect, it } from "vitest";
import { alice, request } from "./fixtures";

it("answers 404 for a path no endpoint has, as JSON like any other failure", async () => {
  const res = await request(alice, "GET", "/nowhere");

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
});
