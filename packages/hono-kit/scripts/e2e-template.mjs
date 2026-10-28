/**
 * 雛形の通し確認。空のディレクトリに hnk init → e2e-src/ を src に写す → pnpm install（postinstall で hnk prepare）→ typecheck → db:generate → pnpm check を通す。
 * テンプレートは別々のファイルだが、組み合わせて初めて型・lint・テストが通る。それをここで守る。
 * 使い方: node scripts/e2e-template.mjs [--packed]
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
// 作ったばかりの雛形が、そのままで通ること（create → install → check が最初に打つもの）。
// 下で書き足したものは prettier --write で整えるので、雛形の書式の崩れはここでしか見えない
run("pnpm", ["install"], app);
// postinstall の hnk prepare で routes.gen.ts ができ、prepare を手で打たなくても型が通る
run("pnpm", ["typecheck"], app);
run("pnpm", ["check"], app);
// アプリを書いた体で、テーブル（db/schema.ts）・route・型のテスト（*.typetest.ts。宣言と handler・client の型が
// 合っているか）を写す。tsc が src の中を全部見るので、置くだけで確かめられる
fs.cpSync(path.join(root, "scripts/e2e-src"), path.join(app, "src"), { recursive: true });
// 動かしたときの振る舞い（リダイレクトの行き先など）は、雛形の test/ の隣に置いて pnpm check のテストで回す
fs.cpSync(path.join(root, "scripts/e2e-test"), path.join(app, "test"), { recursive: true });
// 依存は増えていないので、install をし直すと postinstall が走らない。写した route は prepare で拾う
run("pnpm", ["hnk", "prepare"], app);
run("pnpm", ["typecheck"], app);
run("pnpm", ["db:generate"], app);
run("pnpm", ["exec", "prettier", "--write", "."], app);
run("pnpm", ["check"], app);

console.log(`\n通った（${app}）`);
