import { reportWithDocs } from "../docs.mjs";
import {
  createEndpointNamesOf,
  endpointCallOf,
  isHttpEntry,
  unwrap,
} from "../ast.mjs";
import { fileOf } from "../project.mjs";

/** 読みの名前。service の読みは get か list で始める。それ以外の呼び出しは書き込みとみなす */
const READ_NAME = /^(get|list)([A-Z]|$)/;
/** queries は ReadDb しか持たないので、名前に関係なく読み */
const QUERIES_NAME = /Queries$/;

const propertyOf = (config, name) =>
  config.properties.find(
    (p) =>
      p.type === "Property" &&
      p.key?.type === "Identifier" &&
      p.key.name === name,
  );

/** middleware に allowSystem がある＝再送してくる相手（webhook）の入口 */
const isSystemEntry = (config) => {
  const list = unwrap(propertyOf(config, "middleware")?.value);
  const elements =
    list?.type === "ArrayExpression" ? list.elements : list ? [list] : [];
  return elements.some(
    (e) => e?.type === "Identifier" && e.name === "allowSystem",
  );
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

const walk = (node, visit) => {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child.type === "string") walk(child, visit);
    }
  }
};

/**
 * 利用者の HTTP の書き込みは、1 つの service の 1 回の呼び出しだけ。
 * 再送が無いので、2 回書くと 2 回目で落ちたときに 1 回目だけ残る。
 *
 * 型は見られないので、名前で読みと書きを分ける：get・list で始まるものと queries は読み、
 * それ以外の service の呼び出しは書き込み。再送のある入口（allowSystem の webhook）は
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

        const writes = [];
        walk(handler.body, (n) => {
          if (n.type !== "CallExpression") return;
          const call = serviceCallOf(n, deps);
          if (!call || QUERIES_NAME.test(call.service)) return;
          if (READ_NAME.test(call.method)) return;
          writes.push({ node: n, name: `${call.service}.${call.method}` });
        });

        const [first, ...rest] = writes;
        for (const second of rest) {
          report({
            node: second.node,
            message: `An HTTP handler writes through one call to one service, but ${second.name} writes after ${first.name}: if it fails, the first stays done. Writes that belong together go in one domain and one call; what may catch up later goes through an outbox. Reads are named get… or list…`,
          });
        }
      },
    };
  },
};
