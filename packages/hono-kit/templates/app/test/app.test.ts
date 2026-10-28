import { expect, it } from "vitest";
import { alice, request } from "./fixtures";

it("answers 404 for a path no endpoint has", async () => {
  const res = await request(alice, "GET", "/nowhere");

  expect(res.status).toBe(404);
});
