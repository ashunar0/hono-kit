/**
 * src/routes から src/routes.gen.ts を書く（`hnk prepare`、見張るなら `--watch`）。
 * routes.gen.ts は git に入れない（Void の .void/ と同じ）。install・dev・check のたびに書くので、古いまま残らない。
 * - src/routes/**\/index.ts（JSX を書くなら index.tsx）: export された GET / POST / PUT / PATCH / DELETE が 1 本ずつ endpoint になる。
 *   ディレクトリがパス、[id] は :id、[...path] は残り全部（:path{.+}）、(名前) は URL に出ない（route group）。
 *   _ で始まるファイルとディレクトリは読まない
 * - AppType: 全 endpoint の入力と応答。hc に渡す。チェーンせず、1 本ずつ & で並べる
 *
 * export は oxc-parser で読む。読めないファイルや、endpoint の無い index.ts は、黙って抜かさず理由を出して止まる
 * （抜けたことに気づけないと、AI も人も直せないので）。--watch では止まらず、壊れている間は前の生成物のまま
 */
import fs from "node:fs";
import path from "node:path";
import { parseSync } from "oxc-parser";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const filesIn = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("_") && entry.isDirectory()) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });

/** 値として export している名前。型の export は除く */
const valueExportsOf = (file, problems) => {
  const parsed = parseSync(file, fs.readFileSync(file, "utf8"));
  for (const error of parsed.errors) problems.push(`${file}: ${error.message}`);

  return parsed.module.staticExports
    .flatMap((e) => e.entries)
    .filter((entry) => !entry.isType)
    .flatMap((entry) => (entry.exportName.name ? [entry.exportName.name] : []));
};

/**
 * :param と catch-all の名前を揃えた形。[id] と [itemId]、[...path] と [...rest] は名前が違うだけで
 * 同じ URL を奪い合うので、同じ形として clash を見つけるために使う（catch-all とただの :param は区別したまま）
 */
const shapeOf = (p) => p.split("/").map((s) => (s.endsWith("{.+}") ? "*" : s.startsWith(":") ? ":" : s)).join("/");

/**
 * 静的な段、:param、catch-all の順。/invoices/overdue が /invoices/:id に、/files/:id/meta が /files/:path{.+} に
 * 負けないように（Hono は登録した順に試す）
 */
const rank = (p) => p.split("/").map((s) => (s.endsWith("{.+}") ? "2" : s.startsWith(":") ? "1" : `0${s}`));
const byPath = (a, b) => {
  const [x, y] = [rank(a.path), rank(b.path)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length || METHODS.indexOf(a.method) - METHODS.indexOf(b.method);
};

/**
 * ディレクトリから URL を作る。[id] は :id、[...path] は 1 段以上の残り全部で :path{.+}、
 * (名前) は見た目のまとまり（route group）で URL に出さない。
 * catch-all の下の段と、それ以外の括弧は、黙って文字どおり登録せず、理由を出して止める
 */
const routePathOf = (dir, file, problems) => {
  const parts = dir.split("/").filter(Boolean);
  const segments = parts.flatMap((segment, i) => {
    if (/^\(\w[\w-]*\)$/.test(segment)) return [];
    const param = /^\[(\w+)\]$/.exec(segment);
    if (param) return [`:${param[1]}`];
    const rest = /^\[\.\.\.(\w+)\]$/.exec(segment);
    if (rest) {
      if (i < parts.length - 1)
        problems.push(`${file}: ${segment} (catch-all) takes the rest of the path, so it must be the last segment`);
      return [`:${rest[1]}{.+}`];
    }
    if (/[[\]()]/.test(segment)) {
      problems.push(`${file}: ${segment} is not a path segment. Use [name] for a param, (name) for a group`);
    }
    return [segment];
  });
  return `/${segments.join("/")}`;
};

/** endpoint のファイルの名前。JSX を書くなら .tsx */
const ENTRY_NAMES = ["index.ts", "index.tsx"];

/** 生成するコード、または止める理由 */
export const generate = (src) => {
  const routesDir = path.join(src, "routes");
  const problems = [];
  const files = filesIn(routesDir).sort();
  const importPath = (file) => `./${path.relative(src, file).replace(/\.tsx?$/, "")}`;

  // endpoint
  const routeFiles = files.filter((f) => ENTRY_NAMES.includes(path.basename(f)));
  // index.ts と index.tsx が同じディレクトリにあると、どちらが endpoint か決まらない
  const dirs = new Set();
  for (const file of routeFiles) {
    const dir = path.dirname(file);
    if (dirs.has(dir)) problems.push(`${dir}: both index.ts and index.tsx. Keep one`);
    dirs.add(dir);
  }
  const endpoints = routeFiles.flatMap((file, i) => {
    const dir = path.relative(routesDir, path.dirname(file)).split(path.sep).join("/");
    const routePath = routePathOf(dir, file, problems);
    const names = valueExportsOf(file, problems);

    for (const name of names) {
      const meant = METHODS.find((m) => m === name.toUpperCase());
      if (meant && meant !== name) problems.push(`${file}: export ${name} is not a method. Did you mean ${meant}?`);
    }
    const found = METHODS.filter((m) => names.includes(m));
    if (found.length === 0) problems.push(`${file}: no ${METHODS.join(" / ")} export, so it is no endpoint`);

    return found.map((method) => ({ path: routePath, method, module: `route${i}`, file }));
  });
  // 1 つの URL は 1 つの index.ts。group を外した結果ぶつかったら、[id] と [itemId] のように param 名だけ
  // 違う場合も同じ URL なので、形で比べて止める
  const owners = new Map();
  const clashes = new Set();
  for (const e of endpoints) {
    const shape = shapeOf(e.path);
    const owner = owners.get(shape);
    if (!owner) owners.set(shape, { file: e.file, path: e.path });
    // 同じディレクトリの index.ts と index.tsx は上で止めている
    else if (owner.file !== e.file && path.dirname(owner.file) !== path.dirname(e.file)) {
      const also = owner.path === e.path ? owner.file : `${owner.path} in ${owner.file}`;
      clashes.add(`${e.file}: ${e.path} is also ${also}. One URL, one index file`);
    }
  }
  problems.push(...clashes);
  endpoints.sort(byPath);

  if (problems.length > 0) return { problems };

  const schemas = endpoints.map(
    (e) => `EndpointSchema<"${e.method.toLowerCase()}", "${e.path}", typeof ${e.module}.${e.method}>`,
  );
  const lines = [
    "// Generated by `hnk prepare` from src/routes. Do not edit; run `pnpm hnk prepare`",
    'import type { Hono } from "hono";',
    `import { registerEndpoint${endpoints.length > 0 ? ", type EndpointSchema" : ""} } from "hono-kit";`,
    ...routeFiles.map((file, i) => `import * as route${i} from "${importPath(file)}";`),
    "",
    "/** Every endpoint, static paths first. buildApp calls this once, after its middleware */",
    `export const registerRoutes = (${endpoints.length > 0 ? "app" : "_app"}: Parameters<typeof registerEndpoint>[0]) => {`,
    ...endpoints.map((e) => `  registerEndpoint(app, "${e.method}", "${e.path}", ${e.module}.${e.method});`),
    "};",
    "",
    "/** Every endpoint's input and responses. hc<AppType>(url) gives a typed client */",
    `export type AppType = Hono<{},${schemas.length > 0 ? `\n  ${schemas.join("\n  & ")}\n` : " {}"}>;`,
    "",
  ];

  return { code: lines.join("\n") };
};

/** 中身が変わったときだけ書く。保存のたびに routes.gen.ts を触らないように */
const run = (src) => {
  const out = path.join(src, "routes.gen.ts");
  const result = generate(src);
  if ("problems" in result) {
    console.error(`✗ ${out} not written:\n${result.problems.map((p) => `  ${p}`).join("\n")}`);
    return false;
  }
  if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== result.code) {
    fs.writeFileSync(out, result.code);
    console.log(`✓ ${out} written`);
  }
  return true;
};

export const prepare = ({ watch }) => {
  const src = "src";
  if (!fs.existsSync(path.join(src, "routes"))) {
    console.error("✗ Run this at the app root (where src/routes is)");
    process.exit(1);
  }
  if (!watch) {
    if (!run(src)) process.exit(1);
    return;
  }
  run(src);
  let timer;
  fs.watch(path.join(src, "routes"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(src), 50);
  });
  console.log(`watching ${path.join(src, "routes")}`);
};
