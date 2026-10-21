#!/usr/bin/env node
/**
 * hnk の雛形を出す CLI。
 *   hnk init <dir>              アプリの土台を <dir> に出す（templates/app をコピーするだけ）
 *   hnk g domain <name>         domain の骨組み（model / service / repo.d1 / service.test）を足し、deps.ts につなぐ（templates/domain）
 *   hnk gen [--watch | --check] src/routes から src/routes.gen.ts（登録・queries のつなぎ・AppType）を書く（bin/gen.mjs）
 *
 * リソース（src/routes/<名詞>/）は生成しない。中身はどの domain を使うかで毎回違い、つなぐ先も
 * 親のリソースだったりするので、URL を見て書く（書き方は docs/resources.md）
 *
 * テンプレートは型検査された実物（scripts/e2e-template.mjs が init → g domain → check を通す）。
 * 生成器がするのは、コピーと、語の置き換えと、// hnk: の行の上への追記だけ
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const die = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

// ---- 名前 ----

/** invoices → invoice、categories → category */
const singular = (name) => {
  if (/ies$/.test(name)) return name.replace(/ies$/, "y");
  if (/(s|x|z|ch|sh)es$/.test(name)) return name.replace(/es$/, "");
  if (/s$/.test(name)) return name.replace(/s$/, "");
  return name;
};
const pascal = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** テンプレートの notes を、渡された複数形の名前に置き換える。長い語から順に */
const rename = (text, plural) => {
  const one = singular(plural);

  return text
    .replaceAll("__snake__", snake(plural))
    .replaceAll("Notes", pascal(plural))
    .replaceAll("notes", plural)
    .replaceAll("Note", pascal(one))
    .replaceAll("note", one);
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

/** `// hnk:<marker>` の行の上に、同じ字下げで足す。同じ行が既にあれば足さない */
const insertAbove = (file, marker, lines) => {
  const source = fs.readFileSync(file, "utf8").split("\n");
  const at = source.findIndex((line) => line.trim() === `// hnk:${marker}`);
  if (at < 0) die(`${file} has no // hnk:${marker} line, so the generator cannot wire the domain`);

  const indent = source[at].match(/^\s*/)[0];
  const fresh = lines.filter((line) => !source.some((s) => s.trim() === line.trim()));
  source.splice(at, 0, ...fresh.map((line) => indent + line));
  fs.writeFileSync(file, source.join("\n"));
};

// ---- init ----

const init = (target) => {
  if (!target) die("Usage: hnk init <dir>");
  const dir = path.resolve(target);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) die(`${dir} is not empty`);

  fs.mkdirSync(dir, { recursive: true });
  const appName = path.basename(dir);
  // 既定は npm に出ている同じ版。e2e は HNK_SPEC で手元の hono-kit（link: や file:）に差し替える
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const spec = process.env.HNK_SPEC ?? `^${version}`;
  const from = path.join(root, "templates/app");
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
  console.log("  Add a domain: pnpm hnk g domain <plural name>");
};

// ---- g domain ----

const generateDomain = (plural) => {
  if (!plural || !/^[a-z][a-zA-Z0-9]*$/.test(plural)) {
    die("Usage: hnk g domain <name> (plural camelCase, e.g. invoices, signupRequests)");
  }
  if (!fs.existsSync("src/deps.ts")) {
    die("Run this at the app root (where src/deps.ts is)");
  }
  if (fs.existsSync(`src/domains/${plural}`)) die(`src/domains/${plural} already exists`);

  const from = path.join(root, "templates/domain");
  for (const file of listFiles(from)) {
    const text = fs.readFileSync(path.join(from, file), "utf8");
    write(rename(file, plural), rename(text, plural));
  }

  // deps.ts につなぐ。db の import に scopeTo が要る
  const deps = "src/deps.ts";
  fs.writeFileSync(
    deps,
    fs.readFileSync(deps, "utf8").replace('import { wireDb } from "./db";', 'import { scopeTo, wireDb } from "./db";'),
  );
  const one = singular(plural);
  insertAbove(deps, "imports", [
    `import { ${plural}Repository, ${plural}Table } from "./domains/${plural}/repo.d1";`,
    `import { ${plural}Service } from "./domains/${plural}/service";`,
  ]);
  insertAbove(deps, "deps", [
    `const ${plural} = ${plural}Service(${plural}Repository(scopeTo(db, ${plural}Table)));`,
  ]);
  insertAbove(deps, "returns", [`${plural},`]);

  console.log(`✓ Added src/domains/${plural}/ and wired it into deps.ts (the bare shape of ${one})`);
  console.log("  Fill in the thing, then write the resource under src/routes/ where the URL says (node_modules/hono-kit/docs/resources.md)");
  console.log("  pnpm db:generate && pnpm exec prettier --write . && pnpm check");
};

// ---- 入口 ----

const [command, ...args] = process.argv.slice(2);

if (command === "init") init(args[0]);
else if (command === "g" && args[0] === "domain") generateDomain(args[1]);
// gen だけが oxc-parser を使う。init と g domain は依存を読み込まずに動く（init は依存を入れる前に打つ）
else if (command === "gen") (await import("./gen.mjs")).gen({ watch: args.includes("--watch"), check: args.includes("--check") });
else die("Usage: hnk init <dir> / hnk g domain <name> / hnk gen [--watch | --check]");
