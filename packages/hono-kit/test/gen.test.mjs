/**
 * hnk gen のテスト。一時ディレクトリに src/routes を書き、生成物か止める理由を見る
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../bin/gen.mjs";

const ENDPOINT = "export const GET = createEndpoint({}, async () => {});\n";

const appWith = (files) => {
  const src = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hnk-gen-")), "src");
  for (const [file, text] of Object.entries(files)) {
    const full = path.join(src, "routes", file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return src;
};

const registered = (code) => [...code.matchAll(/registerEndpoint\(app, "(\w+)", "([^"]*)"/g)].map((m) => `${m[1]} ${m[2]}`);

test("[id] は :id、静的な段が先", () => {
  const { code } = generate(appWith({ "invoices/[id]/index.ts": ENDPOINT, "invoices/overdue/index.ts": ENDPOINT }));
  assert.deepEqual(registered(code), ["GET /invoices/overdue", "GET /invoices/:id"]);
});

test("(名前) は URL に出ない", () => {
  const { code } = generate(
    appWith({ "(auth)/sessions/index.ts": ENDPOINT, "(signed-in)/invoices/[id]/index.ts": ENDPOINT }),
  );
  assert.deepEqual(registered(code), ["GET /invoices/:id", "GET /sessions"]);
  assert.match(code, /from "\.\/routes\/\(auth\)\/sessions\/index"/);
});

test("group を外して同じ URL になったら止まる", () => {
  const { problems } = generate(appWith({ "(a)/users/index.ts": ENDPOINT, "(b)/users/index.ts": ENDPOINT }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\(b\)\/users\/index\.ts: \/users is also .*\(a\)\/users\/index\.ts\. One URL, one index\.ts/);
});

test("catch-all はまだ止める", () => {
  const { problems } = generate(appWith({ "files/[...path]/index.ts": ENDPOINT }));
  assert.match(problems[0], /\[\.\.\.path\] \(catch-all\) is not supported yet/);
});

test("読めない括弧は文字どおり登録せず止める", () => {
  const { problems } = generate(appWith({ "posts/[id/index.ts": ENDPOINT }));
  assert.match(problems[0], /\[id is not a path segment/);
});
