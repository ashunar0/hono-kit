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
