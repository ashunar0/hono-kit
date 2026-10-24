import { reportWithDocs } from "../docs.mjs";
import {
  createEndpointNamesOf,
  endpointCallOf,
  isHttpEntry,
  unwrap,
} from "../ast.mjs";
import { fileOf } from "../project.mjs";

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

/** `books.write` / `deps.books.write` なら service の名前を返す */
const writeSideOf = (node, deps) => {
  if (
    node?.type !== "MemberExpression" ||
    node.computed ||
    node.property?.name !== "write"
  )
    return null;
  const target = node.object;
  if (target?.type === "Identifier" && deps.names.has(target.name))
    return target.name;
  if (
    deps.object &&
    target?.type === "MemberExpression" &&
    !target.computed &&
    target.object?.type === "Identifier" &&
    target.object.name === deps.object
  )
    return target.property?.name ?? null;
  return null;
};

/** `books.write.update(...)` / `deps.books.write.update(...)` なら、書き込みの名前と、write の側の node を返す */
const writeCallOf = (node, deps) => {
  const callee = node.callee;
  if (callee?.type !== "MemberExpression" || callee.computed) return null;
  const service = writeSideOf(callee.object, deps);
  if (service === null) return null;
  return {
    side: callee.object,
    name: `${service}.write.${callee.property?.name}`,
  };
};

/** 分解の型の中に write を取り出すものがあるか。`{ write }` / `{ books: { write } }` */
const takesWriteOut = (pattern) =>
  pattern?.type === "ObjectPattern" &&
  pattern.properties.some(
    (p) =>
      p.type === "Property" &&
      ((p.key?.type === "Identifier" && p.key.name === "write") ||
        takesWriteOut(p.value)),
  );

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
 * 読みと書きは、名前ではなく置き場所で分かれている：service は createService で read と write に分かれ、
 * read は書く手段を受け取らない（型で止まる）。なので数えるのは `<service>.write.<method>(...)` の呼び出しだけ。
 * queries も read も数えない。write をその場で呼ばずに取り出す（`const { write } = books`）と数えられないので、それも止める。
 * 再送のある入口（allowSystem の webhook）は、何回走っても同じ結果になる書き込みなら順に書いてよいので、見ない
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
        const sides = [];
        walk(handler.body, (n, inLoop) => {
          const side = writeSideOf(n, deps);
          if (side !== null) sides.push(n);
          if (n.type === "VariableDeclarator" && takesWriteOut(n.id)) {
            const init = unwrap(n.init);
            if (
              init?.type === "Identifier" &&
              (deps.names.has(init.name) || init.name === deps.object)
            )
              sides.push(n);
          }
          if (n.type !== "CallExpression") return;
          const call = writeCallOf(n, deps);
          if (!call) return;
          writes.push({ node: n, side: call.side, name: call.name, inLoop });
        });

        // write をその場で呼ばずに取り出したもの。取り出した先の呼び出しは数えられない
        const called = new Set(writes.map((w) => w.side));
        const param = handler.params?.[2];
        const escaped = [
          ...sides.filter((n) => !called.has(n)),
          ...(takesWriteOut(param) ? [param] : []),
        ];
        for (const node of escaped) {
          report({
            node,
            message: `Call a write where it is used, as \`invoices.write.send(...)\`. Taken out (\`const { write } = invoices\`, passed as a value), it cannot be counted, and an HTTP handler writes through one call to one service`,
          });
        }

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
            message: `An HTTP handler writes through one call to one service, but ${second.name} writes after ${first.name}: if it fails, the first stays done. Writes that belong together go in one domain and one call; what may catch up later goes through an outbox. Reads (\`.read.\` and queries) are not counted`,
          });
        }
      },
    };
  },
};
