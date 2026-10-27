import { expect, it } from "vitest";
import { request } from "./fixtures";

const to = (next: string) => request(null, "GET", `/redirects?next=${encodeURIComponent(next)}`);

it("redirects to a path of this app with 303", async () => {
  const res = await to("/dashboard?tab=1");

  expect(res.status).toBe(303);
  expect(res.headers.get("Location")).toBe("/dashboard?tab=1");
});

it("redirects to a declared origin", async () => {
  const res = await to("https://accounts.example.com/authorize");

  expect(res.status).toBe(303);
  expect(res.headers.get("Location")).toBe("https://accounts.example.com/authorize");
});

it.each(["https://evil.example.com", "//evil.example.com", "/\\evil.example.com", "javascript:alert(1)"])(
  "does not redirect to %s",
  async (next) => {
    const res = await to(next);

    expect(res.status).toBe(500);
    expect(res.headers.get("Location")).toBeNull();
  },
);
