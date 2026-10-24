/**
 * lint ルールのテスト。fixtures/app の各ファイルは、わざと違反を書いてある。
 * 先頭の `// expect: <ルール> | <メッセージの一部>` が、そのファイルに出るべき指摘。
 * メッセージは AI への指示なので、メッセージの一部も固定する。
 * 指摘の数は expect の数と一致する（余計な指摘が出たら落ちる）。expect の無いファイルは 0 件
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "fixtures", "app");
const oxlint = path.join(here, "..", "node_modules", ".bin", "oxlint");

const run = () => {
  let stdout;
  try {
    stdout = execFileSync(
      oxlint,
      ["-c", ".oxlintrc.json", "--format", "json", "."],
      {
        cwd: app,
        encoding: "utf8",
      },
    );
  } catch (error) {
    // 指摘があると終了コードが 1 になる。JSON は stdout に出ている
    stdout = error.stdout;
    if (!stdout) throw error;
  }

  return JSON.parse(stdout).diagnostics;
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const expectations = (file) =>
  [
    ...fs.readFileSync(file, "utf8").matchAll(/^\/\/ expect: (.+?) \| (.+)$/gm),
  ].map((m) => ({
    rule: m[1],
    message: m[2],
  }));

const diagnostics = run();
const files = walk(path.join(app, "src")).filter((f) => f.endsWith(".ts"));

for (const file of files) {
  const rel = path.relative(app, file);
  const expected = expectations(file);
  const actual = diagnostics.filter(
    (d) => path.resolve(app, d.filename) === file,
  );

  test(rel, () => {
    assert.equal(
      actual.length,
      expected.length,
      `指摘の数が違う。出た指摘:\n${actual.map((d) => `${d.code}: ${d.message}`).join("\n")}`,
    );
    for (const e of expected) {
      assert.ok(
        actual.some((d) => d.code === e.rule && d.message.includes(e.message)),
        `${e.rule} | ${e.message} が出ていない。出た指摘:\n${actual.map((d) => `${d.code}: ${d.message}`).join("\n")}`,
      );
    }
  });
}

test("hnk の指摘は全部、読む docs のページを添えていて、そのページが在る", () => {
  const hnk = diagnostics.filter((d) => d.code.startsWith("hnk("));
  assert.ok(hnk.length > 0);
  for (const d of hnk) {
    const page = d.message.match(
      /More: node_modules\/hono-kit\/docs\/(\S+)$/,
    )?.[1];
    assert.ok(page, `${d.code} に docs のページが無い: ${d.message}`);
    assert.ok(
      fs.existsSync(path.join(here, "..", "docs", page)),
      `${d.code} が指す docs/${page} が無い`,
    );
  }
});

test("recommended.json は hnk の全部のルールを有効にしている（ルールを足したら、アプリ側の設定を書き換えずに効く）", async () => {
  const { default: plugin } = await import("../lint/index.mjs");
  const recommended = JSON.parse(
    fs.readFileSync(path.join(here, "..", "lint", "recommended.json"), "utf8"),
  );
  const enabled = recommended.overrides
    .flatMap((o) => Object.keys(o.rules))
    .concat(Object.keys(recommended.rules))
    .filter((name) => name.startsWith("hnk/"))
    .sort();

  assert.deepEqual(
    enabled,
    Object.keys(plugin.rules)
      .map((name) => `hnk/${name}`)
      .sort(),
  );
});
