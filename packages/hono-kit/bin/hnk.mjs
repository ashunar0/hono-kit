#!/usr/bin/env node
/**
 * hnk の雛形を出す CLI。
 *   hnk init <dir> [--template workers|node]
 *                               アプリの土台を <dir> に出す（templates/<名前> をコピーするだけ）。
 *                               --template が無ければその場で選ばせる。端末でなければ選べないので止まる
 *   hnk prepare [--watch]       src/routes から src/routes.gen.ts（登録・AppType）を書く（bin/prepare.mjs）
 *
 * リソース（src/routes/<名詞>/）や業務の置き場所は生成しない。どう分けるかはアプリが決める。
 * テンプレートは型検査された実物（scripts/e2e-template.mjs が init → check を通す）
 */
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const die = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

// ---- ファイル ----

const listFiles = (dir) =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

// ---- init ----

// create-hono と同じく、ランタイムごとに丸ごと 1 セット。並びは選ばせるときの順
const templates = [
  ["workers", "Cloudflare Workers + D1"],
  ["node", "Node + SQLite (libSQL)"],
];
const usage = `Usage: hnk init <dir> [--template ${templates.map(([name]) => name).join("|")}]`;

const chooseTemplate = async () => {
  // 端末でない（CI や AI が打つ）ときに聞いても答えは来ない。何も作らずに止まる
  if (!process.stdin.isTTY) die(`Choose a template with --template. ${usage}`);
  templates.forEach(([name, label], i) => console.log(`  ${i + 1}. ${name}  ${label}`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C / Ctrl+D で抜けたら、何も作らずに止まる
  const answer = await rl.question("Template (number or name): ").then(
    (text) => text.trim(),
    () => die("Cancelled"),
  );
  rl.close();
  const found = templates[Number(answer) - 1] ?? templates.find(([name]) => name === answer);
  if (!found) die(`No template "${answer}". ${usage}`);
  return found[0];
};

const init = async (target, template) => {
  if (!target) die(usage);
  if (template !== undefined && !templates.some(([name]) => name === template))
    die(`No template "${template}". ${usage}`);
  const dir = path.resolve(target);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) die(`${dir} is not empty`);

  const from = path.join(root, "templates", template ?? (await chooseTemplate()));
  fs.mkdirSync(dir, { recursive: true });
  const appName = path.basename(dir);
  // 既定は npm に出ている同じ版。e2e は HNK_SPEC で手元の hono-kit（link: や file:）に差し替える
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const spec = process.env.HNK_SPEC ?? `^${version}`;
  for (const file of listFiles(from)) {
    const text = fs
      .readFileSync(path.join(from, file), "utf8")
      .replaceAll("__APP_NAME__", appName)
      .replaceAll("__HNK_SPEC__", spec);
    // npm は .gitignore を公開物に入れないので、雛形では gitignore の名前で持つ
    write(path.join(dir, file === "gitignore" ? ".gitignore" : file), text);
  }

  console.log(`✓ Created an app in ${dir}`);
  console.log(`  cd ${target} && pnpm install && pnpm check`);
};

// ---- 入口 ----

const [command, ...args] = process.argv.slice(2);

if (command === "init") {
  const at = args.indexOf("--template");
  const template = at === -1 ? undefined : (args[at + 1] ?? die(usage));
  // --template の値は dir に数えない
  const [dir] = args.filter((arg, i) => !arg.startsWith("--") && (at === -1 || i !== at + 1));
  await init(dir, template);
}
// prepare だけが oxc-parser を使う。init は依存を読み込まずに動く（依存を入れる前に打つ）
else if (command === "prepare")
  (await import("./prepare.mjs")).prepare({
    watch: args.includes("--watch"),
  });
else die(`${usage} / hnk prepare [--watch]`);
