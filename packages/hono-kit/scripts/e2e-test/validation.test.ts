import { expect, it } from "vitest";
import { appAs, request } from "./fixtures";
import { env } from "./bindings";

const signUp = (body: unknown) => request(null, "POST", "/signups", body);

it("names every field that is wrong, with every reason, nested ones joined with dots", async () => {
  const res = await signUp({ email: "nope", nickname: "A", pets: [{ name: "" }] });

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      details: {
        email: [expect.any(String)],
        nickname: [expect.any(String), expect.any(String)],
        "pets.0.name": [expect.any(String)],
      },
    },
  });
});

it("says what is wrong with the input as a whole in the message, with no fields", async () => {
  const res = await signUp([1, 2]);

  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { message: string; details: unknown } };
  expect(body.error.message).not.toBe("Invalid request");
  expect(body.error.details).toEqual({});
});

it("a body that is not JSON is a 400 with no fields", async () => {
  const res = await appAs(null).request(
    "/signups",
    { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hi" },
    env,
  );

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: {
      code: "VALIDATION_ERROR",
      message: "Content-Type must be application/json",
      details: {},
    },
  });
});

it("a body that is broken JSON is a 400 with no fields", async () => {
  const res = await appAs(null).request(
    "/signups",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" },
    env,
  );

  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { code: string; details: unknown } };
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.details).toEqual({});
});
