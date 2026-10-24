import { env } from "cloudflare:workers";
import { systemActor } from "hono-kit/testing";
import { expect, it } from "vitest";
import { makeDeps } from "#src/deps";
import { buildApp } from "#src/index";

const app = buildApp(makeDeps);

it("OpenAPI の文書が作れる（query に zod の transform を含んでいても）", async () => {
  const res = await app.request("/openapi.json", {}, env);

  expect(res.status).toBe(200);
  const doc = (await res.json()) as { paths: Record<string, Record<string, unknown>> };
  // routes.gen.ts が登録した endpoint が全部、登録の method で出る
  const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => `${method} ${path}`),
  );
  expect(operations.sort()).toEqual([
    "delete /invoices/{id}",
    "delete /invoices/{id}/shares/{userId}",
    "get /invoices",
    "get /invoices/{id}",
    "get /reports/monthly",
    "post /invoices",
    "post /invoices/{id}/send",
    "post /payments",
    "post /webhooks/stripe",
    "put /invoices/{id}",
    "put /invoices/{id}/shares",
  ]);
});

it("OpenAPI の文書: 日付は日時の文字列で出て、各 schema に $schema が付かない", async () => {
  const res = await app.request("/openapi.json", {}, env);

  const doc = (await res.json()) as {
    paths: Record<
      string,
      Record<
        string,
        { requestBody: { content: Record<string, { schema: Record<string, unknown> }> } }
      >
    >;
  };
  const schema = doc.paths["/invoices/{id}"]!.put!.requestBody.content["application/json"]!.schema;

  expect(schema).not.toHaveProperty("$schema");
  expect((schema.properties as Record<string, unknown>).dueAt).toEqual({
    type: "string",
    format: "date-time",
  });
});

it("ログインしていなければ 401", async () => {
  const res = await app.request("/invoices", {}, env);

  expect(res.status).toBe(401);
});

it("webhook は allowSystem で、署名を確かめた後、支払いと請求書の両方にシステムを渡す", async () => {
  const received: unknown[] = [];
  const fakeApp = buildApp(
    () =>
      ({
        payments: {
          read: {
            async verifyEvent() {
              return { ok: true, value: { providerRef: "cs_x", kind: "succeeded" } };
            },
          },
          write: {
            async receive(system: unknown) {
              received.push(["payments", system]);
              return { ok: true, value: { invoiceId: "inv_x", status: "succeeded" } };
            },
          },
        },
        invoices: {
          write: {
            async markPaid(system: unknown) {
              received.push(["invoices", system]);
              return { ok: true, value: undefined };
            },
          },
        },
      }) as never,
  );

  const res = await fakeApp.request("/webhooks/stripe", { method: "POST", body: "{}" }, env);

  expect(res.status).toBe(200);
  expect(received).toEqual([
    ["payments", systemActor],
    ["invoices", systemActor],
  ]);
});
