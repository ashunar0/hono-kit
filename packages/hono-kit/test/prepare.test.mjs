/**
 * hnk prepare のテスト。一時ディレクトリに src/routes を書き、生成物か止める理由を見る
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../bin/prepare.mjs";

const ENDPOINT = "export const GET = createEndpoint({}, async () => {});\n";

const MAIN = "export const makeDeps = (env) => ({});\n";

/** src/routes の下のファイルと、src/main.ts（null なら置かない） */
const appWith = (files, main = MAIN) => {
  const src = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hnk-prepare-")), "src");
  for (const [file, text] of Object.entries(files)) {
    const full = path.join(src, "routes", file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  if (main !== null) fs.writeFileSync(path.join(src, "main.ts"), main);
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
  assert.match(problems[0], /\(b\)\/users\/index\.ts: \/users is also .*\(a\)\/users\/index\.ts\. One URL, one index file/);
});

test("param 名だけ違う同じ URL も止まる", () => {
  const { problems } = generate(appWith({ "items/[id]/index.ts": ENDPOINT, "items/[itemId]/index.ts": ENDPOINT }));
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /items\/\[itemId\]\/index\.ts: \/items\/:itemId is also \/items\/:id in .*items\/\[id\]\/index\.ts\. One URL, one index file/,
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

test("index.tsx も endpoint。import に拡張子は付けない", () => {
  const { code } = generate(appWith({ "pages/[id]/index.tsx": ENDPOINT }));
  assert.deepEqual(registered(code), ["GET /pages/:id"]);
  assert.match(code, /import \* as route0 from "\.\/routes\/pages\/\[id\]\/index";/);
});

test("同じディレクトリに index.ts と index.tsx があったら止まる", () => {
  const { problems } = generate(appWith({ "pages/index.ts": ENDPOINT, "pages/index.tsx": ENDPOINT }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /both index\.ts and index\.tsx/);
});

test("main.ts の makeDeps を Register に書く", () => {
  const { code } = generate(appWith({ "notes/index.ts": ENDPOINT }));
  assert.match(code, /import type \{ makeDeps \} from "\.\/main";/);
  assert.match(code, /interface Register \{\n    makeDeps: typeof makeDeps;/);
});

test("main.ts が無ければ止まる", () => {
  const { problems } = generate(appWith({ "notes/index.ts": ENDPOINT }, null));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /main\.ts is missing/);
});

test("main.ts が makeDeps を export していなければ止まる", () => {
  const { problems } = generate(appWith({ "notes/index.ts": ENDPOINT }, "export const buildApp = () => {};\n"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /main\.ts: no makeDeps export/);
});

/** src/crons の下のファイルと、アプリの直下の wrangler.jsonc（null なら置かない） */
const appWithCrons = (crons, wrangler = null) => {
  const src = appWith({ "notes/index.ts": ENDPOINT });
  for (const [file, text] of Object.entries(crons)) {
    const full = path.join(src, "crons", file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  if (wrangler !== null) fs.writeFileSync(path.join(src, "..", "wrangler.jsonc"), wrangler);
  return src;
};

const cronAt = (schedule) =>
  `export const cron = createCron({ schedule: "${schedule}" }, async ({ deps, now }) => {});\n`;

test("src/crons の cron を、ファイルの場所を名前にして並べる。_ とテストは読まない", () => {
  const { code } = generate(
    appWithCrons({
      "sweep-orders.ts": cronAt("*/15 * * * *"),
      "billing/monthly.ts": cronAt("0 0 1 * *"),
      "_shared.ts": "export const x = 1;\n",
      "sweep-orders.test.ts": "it();\n",
    }),
  );
  assert.match(code, /\{ name: "billing\/monthly", \.\.\.cron0\.cron \}/);
  assert.match(code, /\{ name: "sweep-orders", \.\.\.cron1\.cron \}/);
  assert.doesNotMatch(code, /_shared|\.test/);
});

test("src/crons が無ければ crons は空", () => {
  const { code } = generate(appWith({ "notes/index.ts": ENDPOINT }));
  assert.match(code, /export const crons = \[\];/);
});

test("cron の export が無い、schedule が文字列でないファイルは止める", () => {
  const { problems } = generate(
    appWithCrons({
      "a.ts": "export const job = 1;\n",
      "b.ts": "const s = '0 8 * * *';\nexport const cron = createCron({ schedule: s }, async () => {});\n",
    }),
  );
  assert.equal(problems.length, 2);
  assert.match(problems[0], /a\.ts: no cron export/);
  assert.match(problems[1], /b\.ts: write the cron as createCron\(\{ schedule: "<a string>" \}/);
});

test("wrangler.jsonc の triggers.crons と同じなら通す（コメントと末尾のカンマがあっても）", () => {
  const wrangler = `{
  // https://example.com/a//b
  "name": "app", /* "crons": ["x"] */
  "triggers": { "crons": ["*/15 * * * *",], },
}`;
  const result = generate(appWithCrons({ "sweep.ts": cronAt("*/15 * * * *") }, wrangler));
  assert.ok("code" in result, result.problems?.join("\n"));
});

test("wrangler.jsonc とずれていたら、両方向とも止める", () => {
  const { problems } = generate(
    appWithCrons({ "sweep.ts": cronAt("*/15 * * * *") }, '{ "triggers": { "crons": ["0 8 * * *"] } }'),
  );
  assert.equal(problems.length, 2);
  assert.match(problems[0], /"\*\/15 \* \* \* \*" \(src\/crons\) is not in triggers\.crons/);
  assert.match(problems[1], /"0 8 \* \* \*" in triggers\.crons has no cron in src\/crons/);
});
