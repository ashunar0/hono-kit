import { env } from "cloudflare:workers";
import { hc } from "hono/client";
import { expect, it } from "vitest";
import type { AppType } from "#src/routes.gen";
import { appAs } from "../../../../test/fixtures";

const client = hc<AppType>("http://localhost", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => appAs(null).request(input, init, env),
});

it("takes the rest of the path as one param", async () => {
  const res = await client.files[":path{.+}"].$get({ param: { path: "a/b/c.txt" } });
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const body = await res.json();
  body.path satisfies string;
  expect(body).toEqual({ path: "a/b/c.txt" });
});
