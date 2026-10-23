/**
 * 雛形の通し確認。空のディレクトリに hnk init → g domain → e2e-routes/ を写す → pnpm install（postinstall で hnk gen --if-missing）→ typecheck → db:generate → pnpm check を通す。
 * テンプレートは別々のファイルだが、組み合わせて初めて型・lint・テストが通る。それをここで守る。
 * 続けて、commit 済みの古い routes.gen.ts を postinstall が書き直して CI の --check を誤魔化さないかも確かめる
 * （src/routes.gen.ts を古くする → CI=1 pnpm install → 触られていないこと → CI=1 pnpm check が routes.gen.ts で落ちること）。
 * 使い方: node scripts/e2e-template.mjs [--packed] [domain 名...]（既定は invoices と signupRequests。複数形と camelCase の置き換えを確かめる）
 *   既定は手元の hono-kit を link: でつなぐ。--packed は pnpm pack した tgz を展開し、その中の CLI と dist で通す（npm に出す物そのもの）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const packed = args.includes("--packed");
const names = args.filter((a) => a !== "--packed");
const domains = names.length > 0 ? names : ["invoices", "signupRequests"];

// シンボリックリンクを解いておく（/var → /private/var のような所で、pnpm の解決がずれないように）
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hnk-e2e-")));
const app = path.join(dir, "demo-app");

const run = (command, args, cwd, env) => {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const { status } = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (status !== 0) {
    console.error(`\n失敗: ${command} ${args.join(" ")}（${cwd}）`);
    process.exit(1);
  }
};

/** 落ちるはずの手。落ちなければここで止める。stdout + stderr を返す（落ちた場所を確かめるため） */
const runExpectFail = (command, args, cwd, env) => {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const { status, stdout, stderr } = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (status === 0) {
    console.error(`\n失敗: ${command} ${args.join(" ")} は落ちるはずだった（${cwd}）`);
    process.exit(1);
  }
  return `${stdout}\n${stderr}`;
};

let cli = path.join(root, "bin/hnk.mjs");
let spec = `link:${fs.realpathSync(root)}`;
if (packed) {
  run("pnpm", ["pack", "--pack-destination", dir], root);
  const tgz = fs.readdirSync(dir).find((f) => f.endsWith(".tgz"));
  run("tar", ["xzf", tgz], dir);
  cli = path.join(dir, "package/bin/hnk.mjs");
  spec = `file:${path.join(dir, tgz)}`;
}

run("node", [cli, "init", app], dir, { HNK_SPEC: spec });
// notes は読みの道（_queries.ts → notesWithin → endpoint → routes.gen.ts → AppType）を雛形の上で通すため、いつも作る。
// リソースは生成しないので、e2e-routes/ の route を手で書いた体で写す
for (const name of new Set(["notes", ...domains])) run("node", [cli, "g", "domain", name], app);
fs.cpSync(path.join(root, "scripts/e2e-routes"), path.join(app, "src/routes"), { recursive: true });
run("pnpm", ["install"], app);
// postinstall の hnk gen で routes.gen.ts ができ、gen を手で打たなくても型が通る
run("pnpm", ["typecheck"], app);
run("pnpm", ["db:generate"], app);
run("pnpm", ["exec", "prettier", "--write", "."], app);
run("pnpm", ["check"], app);

// postinstall は --if-missing: commit 済みの古い routes.gen.ts があっても書き直さず、CI の --check がそれを見つけられるか確かめる
const genOut = path.join(app, "src/routes.gen.ts");
const committed = fs.readFileSync(genOut, "utf8");
const stale = `${committed}// stale\n`;
fs.writeFileSync(genOut, stale);
run("pnpm", ["install", "--offline"], app, { CI: "1" });
if (fs.readFileSync(genOut, "utf8") !== stale) {
  console.error(`\n失敗: postinstall が ${genOut} を書き直した（CI の --check を誤魔化す）`);
  process.exit(1);
}
const failure = runExpectFail("pnpm", ["check"], app, { CI: "1" });
if (!/Failed:.*routes\.gen\.ts/.test(failure)) {
  console.error(`\n失敗: pnpm check は落ちたが、routes.gen.ts が理由と分からない`);
  process.exit(1);
}
run("pnpm", ["hnk", "gen"], app);

console.log(`\n通った（${app}）`);
