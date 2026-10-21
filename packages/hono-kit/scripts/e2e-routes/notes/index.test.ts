import { expect, it } from "vitest";
import { alice, request } from "../../../test/fixtures";

it("reads a created note back through queries", async () => {
  const created = await request(alice, "POST", "/notes");
  expect(created.status).toBe(200);
  const { id } = (await created.json()) as { id: string };

  const res = await request(alice, "GET", `/notes/${id}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id });
  expect((await request(alice, "GET", "/notes/missing")).status).toBe(404);
});
