import { expect, it } from "vitest";
import { admin, alice, bob, carol, request } from "../../../test/fixtures";

const input = { title: "A title", body: "A body" };

/** The response body. Only the fields this file reads */
type Body = { id: string; title: string; items: { id: string }[]; error: { code: string } };

const json = async (res: Response) => (await res.json()) as Body;

/** alice creates a note and returns its id */
const create = async () => {
  const res = await request(alice, "POST", "/__kebab__", input);
  expect(res.status).toBe(200);

  return (await json(res)).id;
};

it("creates, reads and lists; 400 on invalid input", async () => {
  const id = await create();

  const got = await request(alice, "GET", `/__kebab__/${id}`);
  expect(got.status).toBe(200);
  expect((await json(got)).title).toBe("A title");

  const list = await json(await request(alice, "GET", "/__kebab__?limit=100"));
  expect(list.items.map((item) => item.id)).toContain(id);

  const bad = await request(alice, "POST", "/__kebab__", { ...input, title: "" });
  expect(bad.status).toBe(400);
  expect((await json(bad)).error.code).toBe("VALIDATION_ERROR");
});

it("updates and deletes; 404 after deleting", async () => {
  const id = await create();

  const put = await request(alice, "PUT", `/__kebab__/${id}`, { ...input, title: "A new title" });
  expect(put.status).toBe(200);
  expect((await json(put)).title).toBe("A new title");

  expect((await request(alice, "DELETE", `/__kebab__/${id}`)).status).toBe(200);
  expect((await request(alice, "GET", `/__kebab__/${id}`)).status).toBe(404);
});

it("404 for someone else in the same org, visible to the org admin, 404 for another org even as admin", async () => {
  const id = await create();

  expect((await request(bob, "GET", `/__kebab__/${id}`)).status).toBe(404);
  expect((await request(admin, "GET", `/__kebab__/${id}`)).status).toBe(200);
  expect((await request(carol, "GET", `/__kebab__/${id}`)).status).toBe(404);
});

it("401 when signed out", async () => {
  expect((await request(null, "GET", "/__kebab__")).status).toBe(401);
});
