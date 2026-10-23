/**
 * hnk gen のテスト。一時ディレクトリに src/routes を書き、生成物か止める理由を見る
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { generate } from "../bin/gen.mjs";

const hnk = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "hnk.mjs");

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

test("param 名だけ違う同じ URL も止まる", () => {
  const { problems } = generate(appWith({ "items/[id]/index.ts": ENDPOINT, "items/[itemId]/index.ts": ENDPOINT }));
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /items\/\[itemId\]\/index\.ts: \/items\/:itemId is also \/items\/:id in .*items\/\[id\]\/index\.ts\. One URL, one index\.ts/,
  );
});

test("group をまたいで param 名だけ違う同じ URL も止まる", () => {
  const { problems } = generate(
    appWith({ "(a)/items/[id]/index.ts": ENDPOINT, "(b)/items/[itemId]/index.ts": ENDPOINT }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\(b\)\/items\/\[itemId\]\/index\.ts: \/items\/:itemId is also \/items\/:id in/);
});

test("catch-all の名前だけ違う同じ URL も止まる", () => {
  const { problems } = generate(
    appWith({ "files/[...path]/index.ts": ENDPOINT, "files/[...rest]/index.ts": ENDPOINT }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /files\/\[\.\.\.rest\]\/index\.ts: \/files\/:rest\{\.\+\} is also \/files\/:path\{\.\+\} in/);
});

test("[id] と [id]/child、[id] と [...path] は形が違うので止まらない", () => {
  const a = generate(appWith({ "items/[id]/index.ts": ENDPOINT, "items/[id]/child/index.ts": ENDPOINT }));
  assert.equal(a.problems, undefined);

  const b = generate(appWith({ "files/[id]/index.ts": ENDPOINT, "files/[...path]/index.ts": ENDPOINT }));
  assert.equal(b.problems, undefined);
});

test("[...path] は :path{.+}、:param より後", () => {
  const { code } = generate(
    appWith({
      "files/[...path]/index.ts": ENDPOINT,
      "files/[id]/meta/index.ts": ENDPOINT,
      "files/latest/index.ts": ENDPOINT,
    }),
  );
  assert.deepEqual(registered(code), ["GET /files/latest", "GET /files/:id/meta", "GET /files/:path{.+}"]);
  assert.match(code, /EndpointSchema<"get", "\/files\/:path\{\.\+\}"/);
});

test("catch-all の下に段があったら止まる", () => {
  const { problems } = generate(appWith({ "files/[...path]/meta/index.ts": ENDPOINT }));
  assert.match(problems[0], /\[\.\.\.path\] \(catch-all\) takes the rest of the path, so it must be the last segment/);
});

test("読めない括弧は文字どおり登録せず止める", () => {
  const { problems } = generate(appWith({ "posts/[id/index.ts": ENDPOINT }));
  assert.match(problems[0], /\[id is not a path segment/);
});

test("--check は書かずに比べ、古ければ落ちる", () => {
  const src = appWith({ "invoices/index.ts": ENDPOINT });
  const gen = (...args) => spawnSync("node", [hnk, "gen", ...args], { cwd: path.dirname(src), encoding: "utf8" });

  assert.equal(gen("--check").status, 1);
  assert.equal(fs.existsSync(path.join(src, "routes.gen.ts")), false);
  assert.equal(gen().status, 0);
  assert.equal(gen("--check").status, 0);

  fs.mkdirSync(path.join(src, "routes", "customers"));
  fs.writeFileSync(path.join(src, "routes", "customers", "index.ts"), ENDPOINT);
  const stale = gen("--check");
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /is out of date with src\/routes\. Run pnpm hnk gen and commit it/);
});

test("--if-missing は無ければ作り、あれば古くても触らない（postinstall が --check を誤魔化さないように）", () => {
  const src = appWith({ "invoices/index.ts": ENDPOINT });
  const gen = (...args) => spawnSync("node", [hnk, "gen", ...args], { cwd: path.dirname(src), encoding: "utf8" });
  const out = path.join(src, "routes.gen.ts");

  assert.equal(gen("--if-missing").status, 0);
  assert.equal(fs.existsSync(out), true);

  fs.writeFileSync(out, "stale");
  assert.equal(gen("--if-missing").status, 0);
  assert.equal(fs.readFileSync(out, "utf8"), "stale");
});

test("--if-missing は --watch / --check と一緒に使えない", () => {
  const src = appWith({ "invoices/index.ts": ENDPOINT });
  const gen = (...args) => spawnSync("node", [hnk, "gen", ...args], { cwd: path.dirname(src), encoding: "utf8" });

  assert.equal(gen("--if-missing", "--watch").status, 1);
  assert.equal(gen("--if-missing", "--check").status, 1);
});
