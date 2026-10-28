/**
 * hono-kit/vite のテスト。Vite は入れず、Vite が呼ぶフックを同じ形の引数で直に呼ぶ
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { honoKit } from "../vite/index.mjs";

const ENDPOINT = "export const GET = createEndpoint({}, async () => {});\n";

const appWith = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-vite-"));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, "src/routes", file)), { recursive: true });
    fs.writeFileSync(path.join(root, "src/routes", file), text);
  }
  fs.writeFileSync(path.join(root, "src/main.ts"), "export const makeDeps = (env) => ({});\n");
  return root;
};

const start = (root, command) => {
  const plugin = honoKit();
  const errors = [];
  plugin.configResolved({ root, command });
  plugin.buildStart.call({ error: (message) => errors.push(message) });
  return { plugin, errors };
};

test("dev の始めに routes.gen.ts を書き、src/routes が変われば書き直す", () => {
  const root = appWith({ "invoices/index.ts": ENDPOINT });
  const out = path.join(root, "src/routes.gen.ts");
  const { plugin } = start(root, "serve");
  assert.match(fs.readFileSync(out, "utf8"), /"\/invoices"/);

  const watcher = new EventEmitter();
  plugin.configureServer({ watcher });
  const added = path.join(root, "src/routes/customers/index.ts");
  fs.mkdirSync(path.dirname(added));
  fs.writeFileSync(added, ENDPOINT);
  watcher.emit("add", added);
  assert.match(fs.readFileSync(out, "utf8"), /"\/customers"/);
});

test("src/routes の外の変更では書かない", () => {
  const root = appWith({ "invoices/index.ts": ENDPOINT });
  const out = path.join(root, "src/routes.gen.ts");
  const { plugin } = start(root, "serve");
  const watcher = new EventEmitter();
  plugin.configureServer({ watcher });

  fs.writeFileSync(out, "untouched");
  watcher.emit("change", path.join(root, "src/main.ts"));
  watcher.emit("change", out);
  assert.equal(fs.readFileSync(out, "utf8"), "untouched");
});

test("壊れた routes は build では止め、dev では止めない", () => {
  const broken = { "posts/[id/index.ts": ENDPOINT };
  assert.equal(start(appWith(broken), "build").errors.length, 1);
  assert.equal(start(appWith(broken), "serve").errors.length, 0);
});
