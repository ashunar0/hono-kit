/**
 * src/domains の置き場所を、何を import するかで守らせる oxlint のプラグイン（試し）。
 * 決まりは docs/domains.md。ここは止めるだけで、なぜかは docs に書く
 * 元は hono-kit の presets/domains。直すならそこで直して写し直す
 */
import fs from "node:fs";
import path from "node:path";

/** アプリの根から見たパス（src/domains/expense/usecases/editExpense.ts）。区切りは / */
const relativeOf = (file, root) => path.relative(root, file).replace(/\\/g, "/");

const isTest = (rel) =>
  /\.(test|typetest|spec)\.tsx?$/.test(rel) || rel.endsWith("/_test-helpers.ts");

/**
 * ファイルの種類。domain なら { kind: "index" | "rules" | "queries" | "mutations" | "usecases" | "usecases-shared", domain }、
 * route なら { kind: "route", resource }。どちらでもなければ null
 */
const kindOf = (rel) => {
  const domain = /^src\/domains\/([^/]+)\/(index|rules|queries|mutations)\.ts$/.exec(rel);
  if (domain) return { kind: domain[2], domain: domain[1] };
  const usecase = /^src\/domains\/([^/]+)\/usecases\/(_?)[^/]+\.ts$/.exec(rel);
  if (usecase) return { kind: usecase[2] ? "usecases-shared" : "usecases", domain: usecase[1] };
  const route = /^src\/routes\/(.+)$/.exec(rel);
  if (route) {
    // (signed-in) のような括弧のディレクトリは URL に入らないので、resource の名前からも外す
    const resource = route[1].split("/").find((s) => !/^\(.*\)$/.test(s));
    return { kind: "route", resource };
  }
  return null;
};

/** import の行き先。アプリの中なら { rel }（拡張子は .ts を補う）、パッケージなら { pkg } */
const targetOf = (specifier, file, root) => {
  let abs;
  if (specifier.startsWith("#/")) abs = path.join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) abs = path.resolve(path.dirname(file), specifier);
  else return { pkg: specifier };
  const rel = relativeOf(abs, root).replace(/\.tsx?$/, "");
  return { rel: `${rel}.ts` };
};

const isPkg = (target, name) => target.pkg === name || target.pkg?.startsWith(`${name}/`);

const readOr = (file, fallback) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
};

/**
 * 表の持ち主。src/db/schema.ts の見出し（// ── expense ──）の下で export された表は、そのドメインのもの。
 * 見出しより前の表（認証の表など）は、どのドメインのものでもない
 */
const ownersOf = (root) => {
  const owners = new Map();
  let owner = null;
  for (const line of readOr(path.join(root, "src/db/schema.ts"), "").split("\n")) {
    const heading = /^\/\/ ── (\S+) ──/.exec(line);
    if (heading) owner = heading[1];
    const table = /^export const (\w+)\s*=\s*sqliteTable\(/.exec(line);
    if (table && owner) owners.set(table[1], owner);
  }
  return owners;
};

/** ドメインどうしの依存（ファイルを読んで 1 度だけ作る）。rules どうしの直接の import も数える */
let world;
const worldOf = (root) => {
  if (world) return world;
  const dir = path.join(root, "src/domains");
  const domains = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
    : [];
  const edges = new Map();
  for (const d of domains) {
    const files = [];
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && !isTest(relativeOf(full, root))) files.push(full);
      }
    };
    walk(path.join(dir, d));
    const to = new Set();
    for (const f of files) {
      for (const m of readOr(f, "").matchAll(/from\s+"([^"]+)"/g)) {
        const t = targetOf(m[1], f, root);
        const other = t.rel && /^src\/domains\/([^/]+)\//.exec(t.rel)?.[1];
        if (other && other !== d) to.add(other);
      }
    }
    edges.set(d, to);
  }
  world = { edges, owners: ownersOf(root) };
  return world;
};

/** from から始めて to に戻る道（[from, …, to]）。無ければ null */
const pathBetween = (edges, from, to) => {
  const seen = new Set();
  const walk = (d, trail) => {
    if (d === to) return trail;
    if (seen.has(d)) return null;
    seen.add(d);
    for (const next of edges.get(d) ?? []) {
      const found = walk(next, [...trail, next]);
      if (found) return found;
    }
    return null;
  };
  return walk(from, [from]);
};

/** 同じドメインの中の import。止める理由、null なら通す */
const insideViolation = (from, to, target, typeOnly) => {
  if (to.kind === "index")
    return "A domain's own files import each other directly; index.ts is for other domains and the routes";
  if (from.kind === "index") {
    if (to.kind === "rules")
      return "index.ts does not export rules: rules.ts is read directly, by anyone";
    if (to.kind === "mutations")
      return "index.ts does not export mutations: other domains write through a usecase";
    if (to.kind === "usecases-shared")
      return "index.ts does not export usecases/_*: they are shared by this domain's usecases only";
    return null;
  }
  if (from.kind === "rules") {
    if (!typeOnly && to.kind !== "rules")
      return "rules import only other rules: what needs a read or a write goes in usecases";
    return null;
  }
  if (from.kind === "queries" || from.kind === "mutations") {
    if (to.kind === "usecases" || to.kind === "usecases-shared")
      return `${from.kind}.ts is called by usecases, not the other way`;
    return null;
  }
  if (from.kind === "usecases" || from.kind === "usecases-shared") {
    if (to.kind === "usecases")
      return "A usecase does not call another usecase of its own domain. Share the part both need in usecases/_<name>.ts";
    return null;
  }
  return null;
};

/** 止める理由。null なら通す */
const violationOf = (from, fromRel, target, typeOnly, names, root) => {
  const to = target.rel ? kindOf(target.rel) : null;
  const toDb = target.rel?.startsWith("src/db/");
  const fromDomain = from.domain;

  // パッケージと db は、ファイルの種類で決まる
  if (from.kind === "rules" && !typeOnly) {
    if (isPkg(target, "drizzle-orm") || toDb)
      return "rules do no I/O: a read goes in queries.ts, a write in mutations.ts";
    if (isPkg(target, "hono") || isPkg(target, "hono-kit"))
      return "rules know nothing of HTTP or deps: keep them plain functions and values (a failure is a plain { code, kind, message } object)";
  }
  if ((from.kind === "usecases" || from.kind === "usecases-shared") && isPkg(target, "drizzle-orm"))
    return "usecases do not write SQL: put the read in queries.ts and the write in mutations.ts, and call them";
  if (from.kind === "route" && !typeOnly && (isPkg(target, "drizzle-orm") || toDb))
    return "A route does not touch the database: read through a domain's queries, write through its usecases";
  // 表は 1 つのドメインだけが持つ。queries と mutations が触るのは、schema.ts の自分の見出しの下の表だけ
  if ((from.kind === "queries" || from.kind === "mutations") && target.rel === "src/db/schema.ts") {
    const { owners } = worldOf(root);
    const others = names.filter((n) => owners.has(n) && owners.get(n) !== fromDomain);
    if (others.length > 0)
      return `A table belongs to one domain: ${others.map((n) => `${n} is ${owners.get(n)}'s`).join(", ")} (its heading in src/db/schema.ts). Read it through that domain's queries, write it through its usecases`;
  }
  if (from.kind === "index" && (target.pkg || !to || to.domain !== fromDomain))
    return "index.ts only re-exports its own domain's queries and usecases";

  if (to?.kind === "route" && from.kind !== "route")
    return "Nothing outside src/routes imports a route";

  // route どうし
  if (from.kind === "route" && to?.kind === "route") {
    // _response.ts は返す形だけなので、同じものを返す別のリソースからも読める
    if (to.resource !== from.resource && !target.rel.endsWith("/_response.ts"))
      return `A route imports only its own resource's files (${from.resource}), and another resource's _response.ts. A shape both return goes in the _response.ts of the resource that owns it`;
    return null;
  }

  if (!to?.domain) return null;

  if (fromRel.startsWith("src/lib/"))
    return "src/lib is the shared place below every domain: it imports no domain. What needs a domain's words goes in that domain";

  // 同じドメインの中
  if (to.domain === fromDomain) return insideViolation(from, to, target, typeOnly);

  // 他のドメイン、または routes・db・main.ts から。読めるのは index.ts（queries・usecases）と rules.ts だけ
  if (to.kind !== "index" && to.kind !== "rules")
    return `Another domain is read only through its index.ts (queries, usecases) or its rules.ts: import from "#/domains/${to.domain}/index" or "#/domains/${to.domain}/rules"`;

  if (to.kind === "index") {
    // index.ts は queries を公開する。queries より下にいるものが読むと、上の層を引き込んで循環する
    if (from.kind === "rules" || fromRel.startsWith("src/db/"))
      return `${from.kind === "rules" ? "rules.ts" : "src/db"} reads another domain's rules only: import from "#/domains/${to.domain}/rules"`;
    if (from.kind === "queries" || from.kind === "mutations")
      return `${from.kind}.ts reads another domain's rules only ("#/domains/${to.domain}/rules"). Combine reads and writes of several domains in a usecase`;
  }

  if (fromDomain) {
    const { edges } = worldOf(root);
    const circle = pathBetween(edges, to.domain, fromDomain);
    if (circle)
      return `Domains may not depend on each other in a circle: ${[fromDomain, ...circle].join(" → ")}. Something sits in the wrong domain: move what both need to where both can read it one way`;
  }
  return null;
};

const domainImports = {
  create(context) {
    const file = context.filename;
    const root = context.cwd;
    const rel = relativeOf(file, root);
    if (!rel.startsWith("src/") || isTest(rel)) return {};
    const from = kindOf(rel) ?? { kind: "other" };

    const check = (node) => {
      if (!node.source) return;
      const declTypeOnly = node.importKind === "type" || node.exportKind === "type";
      const specifiers = node.specifiers ?? [];
      const valueNames = specifiers
        .filter((s) => s.importKind !== "type" && s.exportKind !== "type")
        .map((s) => s.imported?.name ?? s.local?.name)
        .filter((n) => n && n !== "default");
      const typeOnly = declTypeOnly || (specifiers.length > 0 && valueNames.length === 0);
      const reason = violationOf(
        from,
        rel,
        targetOf(node.source.value, file, root),
        typeOnly,
        typeOnly ? [] : valueNames,
        root,
      );
      if (reason)
        context.report({
          node: node.source,
          message: `${rel} may not import ${node.source.value}. ${reason}. More: docs/domains.md`,
        });
    };

    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};

export default {
  meta: { name: "domains" },
  rules: { imports: domainImports },
};
