import { expect, it } from "vitest";
import { appAs } from "./fixtures";
import { env } from "./bindings";

it("leaves out a key the declaration does not have", async () => {
  const res = await appAs(null).request("/profiles", {}, env);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name: "hono" });
});

it("answers 500 for a body that does not match the declaration", async () => {
  const res = await appAs(null).request("/profiles?broken=1", {}, env);

  expect(res.status).toBe(500);
  expect(await res.text()).not.toContain("does not match");
});
