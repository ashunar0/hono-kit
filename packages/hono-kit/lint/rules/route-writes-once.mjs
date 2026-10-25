import { reportWithDocs } from "../docs.mjs";
import {
  createEndpointNamesOf,
  endpointCallOf,
  isHttpEntry,
  unwrap,
} from "../ast.mjs";
import { fileOf } from "../project.mjs";

/**
 * 読みだけを持つもの。domain の読み（…Reader）と、GET の読み（…Queries）。
 * どちらも書く道具を受け取らないので、何を呼んでも読み。それ以外の service の呼び出しは全部書き込み
 */
const READS = /(Reader|Queries)$/;

const propertyOf = (config, name) =>
  config.properties.find(
    (p) =>
      p.type === "Property" &&
      p.key?.type === "Identifier" &&
      p.key.name === name,
  );

/** auth が allowSystem＝再送してくる相手（webhook）の入口 */
const isSystemEntry = (config) => {
  const auth = unwrap(propertyOf(config, "auth")?.value);
  return auth?.type === "Identifier" && auth.name === "allowSystem";
};

/** handler の 3 つ目の引数から、deps の名前を集める。`{ books, loans }` か `deps` */
const depsOf = (handler) => {
  const param = handler.params?.[2];
  if (param?.type === "ObjectPattern") {
    const names = new Set();
    for (const p of param.properties) {
      if (p.type === "Property" && p.value?.type === "Identifier")
        names.add(p.value.name);
    }
    return { names, object: null };
  }
  if (param?.type === "Identifier")
    return { names: new Set(), object: param.name };
  return null;
};

/** `books.update(...)` / `deps.books.update(...)` なら service の名前と method を返す */
const serviceCallOf = (node, deps) => {
  const callee = node.callee;
  if (callee?.type !== "MemberExpression" || callee.computed) return null;
  const method = callee.property?.name;
  const target = callee.object;
  if (target?.type === "Identifier" && deps.names.has(target.name))
    return { service: target.name, method };
  if (
    deps.object &&
    target?.type === "MemberExpression" &&
    !target.computed &&
    target.object?.type === "Identifier" &&
    target.object.name === deps.object
  )
    return { service: target.property?.name, method };
  return null;
};

/** 何回も走る子のキー。ループの本体や条件、要素ごとの callback（ids.map(...) の引数）。for の init や of の右側は 1 回 */
const REPEATED = {
  ForStatement: ["test", "update", "body"],
  ForInStatement: ["body"],
  ForOfStatement: ["body"],
  WhileStatement: ["test", "body"],
  DoWhileStatement: ["test", "body"],
};
/** 配列の要素ごとに callback を呼ぶ method */
const ITERATING = new Set([
  "map",
  "flatMap",
  "forEach",
  "reduce",
  "filter",
  "some",
  "every",
]);

const repeatedKeysOf = (node) => {
  if (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    ITERATING.has(node.callee.property?.name)
  )
    return ["arguments"];
  return REPEATED[node.type] ?? [];
};

/** inLoop: ループの中か、要素ごとの callback の中（字面では 1 回でも、何回も走る） */
const walk = (node, visit, inLoop = false) => {
  if (!node || typeof node.type !== "string") return;
  visit(node, inLoop);
  const repeated = repeatedKeysOf(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child.type === "string")
        walk(child, visit, inLoop || repeated.includes(key));
    }
  }
};

/** 本体で deps を分解した名前も足す。`const { books } = deps` / `const books = deps.books` */
const addDestructured = (body, deps) => {
  if (!deps.object) return;
  walk(body, (n) => {
    if (n.type !== "VariableDeclarator") return;
    const init = unwrap(n.init);
    if (
      n.id?.type === "ObjectPattern" &&
      init?.type === "Identifier" &&
      init.name === deps.object
    ) {
      for (const p of n.id.properties) {
        if (p.type === "Property" && p.value?.type === "Identifier")
          deps.names.add(p.value.name);
      }
    }
    if (
      n.id?.type === "Identifier" &&
      init?.type === "MemberExpression" &&
      !init.computed &&
      init.object?.type === "Identifier" &&
      init.object.name === deps.object
    )
      deps.names.add(n.id.name);
  });
};

/**
 * 利用者の HTTP の書き込みは、1 つの service の 1 回の呼び出しだけ。
 * 再送が無いので、2 回書くと 2 回目で落ちたときに 1 回目だけ残る。
 *
 * service は書き込みだけを持ち、読みは …Reader と …Queries に分かれている。だから service の呼び出しを数えるだけでよく、
 * method の名前は見ない。再送のある入口（allowSystem の webhook）は
 * 何回走っても同じ結果になる書き込みなら順に書いてよいので、見ない
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "rules.md");
    if (!isHttpEntry(fileOf(context))) return {};
    const createEndpointNames = createEndpointNamesOf();

    return {
      Program: createEndpointNames.Program,
      CallExpression(node) {
        const call = endpointCallOf(node, createEndpointNames.names);
        if (!call) return;
        const { config, handler } = call;
        if (!handler) return;
        if (isSystemEntry(config)) return;
        const deps = depsOf(handler);
        if (!deps) return;
        addDestructured(handler.body, deps);

        const writes = [];
        walk(handler.body, (n, inLoop) => {
          if (n.type !== "CallExpression") return;
          const call = serviceCallOf(n, deps);
          if (!call || READS.test(call.service)) return;
          writes.push({
            node: n,
            name: `${call.service}.${call.method}`,
            inLoop,
          });
        });

        for (const write of writes.filter((w) => w.inLoop)) {
          report({
            node: write.node,
            message: `An HTTP handler writes through one call to one service, but ${write.name} runs once per item of a loop: if one fails, the ones before it stay done. Pass the whole list to one service call that writes it all or nothing`,
          });
        }
        const [first, ...rest] = writes;
        for (const second of rest.filter((w) => !w.inLoop)) {
          report({
            node: second.node,
            message: `An HTTP handler writes through one call to one service, but ${second.name} writes after ${first.name}: if it fails, the first stays done. Writes that belong together go in one domain and one call; what may catch up later goes through an outbox. A service only writes: read through the domain's reader (…Reader) or the resource's queries (…Queries)`,
          });
        }
      },
    };
  },
};
