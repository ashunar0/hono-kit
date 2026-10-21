/**
 * hnk g domain のテスト。一時ディレクトリに hnk init した上で打つ
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const hnk = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "hnk.mjs");

const newApp = () => {
  const app = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hnk-domain-")), "app");
  spawnSync("node", [hnk, "init", app]);
  return app;
};
const g = (app, ...args) => spawnSync("node", [hnk, "g", "domain", ...args], { cwd: app, encoding: "utf8" });
const textsIn = (dir) =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => fs.readFileSync(path.join(e.parentPath, e.name), "utf8"));

test("雛形の note は全部置き換わる", () => {
  const app = newApp();
  assert.equal(g(app, "signupRequests").status, 0);

  const texts = textsIn(path.join(app, "src/domains/signupRequests")).join("\n");
  assert.doesNotMatch(texts, /note/i);
  assert.match(texts, /newSignupRequestId/);
  assert.match(texts, /signupRequestsTable/);
  assert.match(texts, /"signup_requests_within"/);
});

test("deps.ts の marker が無ければ、何も書かずに止まる", () => {
  const app = newApp();
  const deps = path.join(app, "src/deps.ts");
  const before = fs.readFileSync(deps, "utf8").replace(/^\s*\/\/ hnk:returns\n/m, "");
  fs.writeFileSync(deps, before);

  const result = g(app, "invoices");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no \/\/ hnk:returns line.*Nothing was written/);
  assert.equal(fs.existsSync(path.join(app, "src/domains/invoices")), false);
  assert.equal(fs.readFileSync(deps, "utf8"), before);
});

test("単数形が怪しいときは止まり、--singular で決められる", () => {
  const app = newApp();

  const same = g(app, "data");
  assert.equal(same.status, 1);
  assert.match(same.stderr, /the singular would be the same word/);
  const looksSingular = g(app, "status");
  assert.equal(looksSingular.status, 1);
  assert.match(looksSingular.stderr, /status looks singular/);
  assert.equal(fs.existsSync(path.join(app, "src/domains")) && fs.readdirSync(path.join(app, "src/domains")).join(), "users");

  const given = g(app, "data", "--singular", "datum");
  assert.equal(given.status, 0);
  assert.match(given.stdout, /one is datum, the type is Datum/);
  assert.match(fs.readFileSync(path.join(app, "src/domains/data/model.ts"), "utf8"), /export type Datum = \{/);
});
