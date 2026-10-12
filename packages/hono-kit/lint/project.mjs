import fs from "node:fs";
import path from "node:path";

export const fileOf = (context) => context.filename ?? context.getFilename();

/** 一番近い tsconfig.json のあるディレクトリと、その paths。アプリの根として使う */
export const projectCache = new Map();
export const projectOf = (file) => {
  let dir = path.dirname(file);
  while (true) {
    if (projectCache.has(dir)) return projectCache.get(dir);
    const tsconfig = path.join(dir, "tsconfig.json");
    if (fs.existsSync(tsconfig)) {
      const { compilerOptions } = JSON.parse(fs.readFileSync(tsconfig, "utf8"));
      const project = { root: dir, paths: compilerOptions?.paths ?? {} };
      projectCache.set(dir, project);
      return project;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** import 先をファイルの絶対パスに解決する。相対 import と tsconfig の paths。パッケージなら null */
export const resolveImport = (file, specifier, project) => {
  if (specifier.startsWith("."))
    return path.resolve(path.dirname(file), specifier);
  for (const [alias, [target]] of Object.entries(project.paths)) {
    const prefix = alias.replace(/\*$/, "");
    if (
      alias.endsWith("*") ? specifier.startsWith(prefix) : specifier === alias
    ) {
      return path.resolve(
        project.root,
        target.replace("*", specifier.slice(prefix.length)),
      );
    }
  }
  return null;
};

/** パッケージ名。`drizzle-orm/d1` は `drizzle-orm`、`@hono/zod-openapi` はそのまま。hono-kit だけは入口ごとに分ける */
export const packageOf = (specifier) => {
  if (specifier === "hono-kit" || specifier.startsWith("hono-kit/")) return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

/**
 * api/routes/ の中のファイルの役割。リソース（URL の名詞）ごとのディレクトリに、
 * router（index.ts）と、HTTP での見せ方（response.ts）だけを置く。
 * import 先は拡張子が無く、`./menus` のようにディレクトリを指すこともある（その index.ts）
 */
const resourceRoleOf = (resolved, rest) => {
  if (/\.(test|typetest|spec)$/.test(rest)) return "test";
  if (/(^|\/)index$/.test(rest)) return "resource";
  if (/(^|\/)response$/.test(rest)) return "response";
  if (!/\.tsx?$/.test(resolved) && fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory())
    return "resource";
  return "resourceOther";
};

/**
 * アプリの中のファイルを、役割で見る。
 * modules/<m>/<role>.ts → { module, role }。何に繋ぐかの技術名は落とす（repo.d1 → repo、webhook.stripe → webhook）。
 * modules/<m>/commands/<name>.ts → { module, role: "commands" }。
 * api/routes/<名詞>/index.ts → { role: "resource" }、…/response.ts → { role: "response" }。module ではない。
 * api 直下の決めごと（errors, middleware, db, env, deps）→ { role }。
 * db/errors は db とは別の役割（dbErrors）。repo が値で使えるのは、これだけ
 */
export const placeOf = (resolved, root) => {
  const relWithIndex = path
    .relative(root, resolved)
    .replace(/\\/g, "/")
    .replace(/\.tsx?$/, "");
  let m;
  if ((m = relWithIndex.match(/^api\/routes\/(.+)$/)))
    return { role: resourceRoleOf(resolved, m[1]) };
  const rel = relWithIndex.replace(/\/index$/, "");
  if ((m = rel.match(/^api\/modules\/([^/]+)\/(.+)$/))) {
    const [, module, rest] = m;
    // テストは役割の外。何を import してもよい
    if (/\.(test|typetest|spec)$/.test(rest)) return { module, role: "test" };
    if (
      rest.startsWith("commands/") &&
      !rest.slice("commands/".length).includes("/")
    )
      return { module, role: "commands" };
    if (!rest.includes("/")) return { module, role: rest.split(".")[0] };
    return { module, role: rest };
  }
  if (rel === "api/db/errors") return { role: "dbErrors" };
  if ((m = rel.match(/^api\/(errors|env|deps|db)$/))) return { role: m[1] };
  if (rel.startsWith("api/middleware/")) return { role: "middleware" };
  return { role: rel };
};
