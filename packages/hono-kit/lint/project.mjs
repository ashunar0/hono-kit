import fs from "node:fs";
import path from "node:path";

export const fileOf = (context) => context.filename ?? context.getFilename();

/** package.json の imports（`#src/*`）。無ければ空 */
const importsOf = (dir) => {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")).imports ?? {};
};

/**
 * 一番近い tsconfig.json のあるディレクトリと、その paths と package.json の imports。アプリの根として使う。
 * imports は paths と同じ形（{ "#src/*": ["./src/*.ts"] }）に揃えておく
 */
export const projectCache = new Map();
export const projectOf = (file) => {
  let dir = path.dirname(file);
  while (true) {
    if (projectCache.has(dir)) return projectCache.get(dir);
    const tsconfig = path.join(dir, "tsconfig.json");
    if (fs.existsSync(tsconfig)) {
      const { compilerOptions } = JSON.parse(fs.readFileSync(tsconfig, "utf8"));
      const imports = Object.entries(importsOf(dir)).flatMap(
        ([alias, target]) =>
          typeof target === "string" ? [[alias, [target]]] : [],
      );
      const project = {
        root: dir,
        paths: { ...Object.fromEntries(imports), ...compilerOptions?.paths },
      };
      projectCache.set(dir, project);
      return project;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** import 先をファイルの絶対パスに解決する。相対 import、tsconfig の paths、package.json の imports。パッケージなら null */
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
  if (specifier === "hono-kit" || specifier.startsWith("hono-kit/"))
    return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

/**
 * src/routes/ の中のファイルの役割。リソース（URL の名詞）ごとのディレクトリに、
 * endpoint（index.ts）と、そばに置くもの（_ で始まる）だけを置く: HTTP での見せ方（_response.ts）、
 * その入口だけの失敗（_errors.ts）、GET の読み（_queries.ts）。
 * import 先は拡張子が無く、`./menus` のようにディレクトリを指すこともある（その index.ts）
 */
const resourceRoleOf = (resolved, rest) => {
  if (/\.(test|typetest|spec)$/.test(rest)) return "test";
  if (/(^|\/)index$/.test(rest)) return "resource";
  if (/(^|\/)_response$/.test(rest)) return "response";
  if (/(^|\/)_errors$/.test(rest)) return "errors";
  if (/(^|\/)_queries$/.test(rest)) return "queries";
  if (
    !/\.tsx?$/.test(resolved) &&
    fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()
  )
    return "resource";
  return "resourceOther";
};

/**
 * アプリの中のファイルを、役割で見る。
 * src/domains/<m>/<role>.ts → { domain, role }。何に繋ぐかの技術名は落とす（repo.d1 → repo、mailer.resend → mailer）。
 * src/routes/<名詞>/index.ts → { role: "resource" }、…/_response.ts → { role: "response" }。domain ではない。
 * src 直下の決めごと（errors, middleware, db, env, deps）→ { role }。
 * src/jobs/ の中は全部 { role: "job" }（HTTP 以外の入口。domain ではない）。
 * src/lib/ の中は全部 { role: "lib" }（業務を知らない＝別のアプリにそのまま持っていけるもの）
 */
export const placeOf = (resolved, root) => {
  const relWithIndex = path
    .relative(root, resolved)
    .replace(/\\/g, "/")
    .replace(/\.tsx?$/, "");
  let m;
  if ((m = relWithIndex.match(/^src\/routes\/(.+)$/)))
    return { role: resourceRoleOf(resolved, m[1]) };
  const rel = relWithIndex.replace(/\/index$/, "");
  if ((m = rel.match(/^src\/domains\/([^/]+)\/(.+)$/))) {
    const [, domain, rest] = m;
    // テストは役割の外。何を import してもよい
    if (/\.(test|typetest|spec)$/.test(rest)) return { domain, role: "test" };
    if (!rest.includes("/")) return { domain, role: rest.split(".")[0] };
    return { domain, role: rest };
  }
  if (rel.startsWith("src/jobs/"))
    return { role: /\.(test|typetest|spec)$/.test(rel) ? "test" : "job" };
  if (rel.startsWith("src/lib/")) return { role: "lib" };
  if ((m = rel.match(/^src\/(errors|env|deps|db)$/))) return { role: m[1] };
  if (rel.startsWith("src/middleware/")) return { role: "middleware" };
  return { role: rel };
};
