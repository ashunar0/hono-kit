/** HTTP の入口か（src/routes/ のリソース。webhook もここ）。endpoint を書く場所 */
export const isHttpEntry = (file) =>
  /[/\\]src[/\\]routes[/\\](?:.+[/\\])?index\.tsx?$/.test(file);

/** `as const` や `satisfies` を剥がす */
export const unwrap = (node) => {
  let cur = node;
  while (
    cur &&
    (cur.type === "TSAsExpression" || cur.type === "TSSatisfiesExpression")
  )
    cur = cur.expression;
  return cur;
};

export const FUNCTIONS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/**
 * 部分木を歩く。入れ子の関数には降りない——中の await は
 * その関数のものであって、今見ている呼び出しのものではない
 */
export const walkOwnScope = (node, visit) => {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (!child || typeof child.type !== "string") continue;
      if (FUNCTIONS.has(child.type)) continue;
      walkOwnScope(child, visit);
    }
  }
};

/**
 * ファイルの中で createEndpoint が束縛されている名前（alias 含む）を集める。
 * `import { createEndpoint as ep } from "hono-kit"` でも ep を同じものとして見るため。
 * Program で先に集めるので、import 文がファイルのどこにあっても同じに見る
 */
export const createEndpointNamesOf = () => {
  const names = new Set();
  return {
    names,
    Program(node) {
      for (const statement of node.body) {
        if (
          statement.type !== "ImportDeclaration" ||
          statement.source?.value !== "hono-kit"
        )
          continue;
        for (const s of statement.specifiers ?? []) {
          if (
            s.type === "ImportSpecifier" &&
            (s.imported?.name ?? s.imported?.value) === "createEndpoint"
          )
            names.add(s.local.name);
        }
      }
    },
  };
};

/**
 * endpoint の宣言の呼び出し `export const GET = createEndpoint(config, fn)`。
 * createEndpointNames は createEndpointNamesOf() が返す names（alias 含む）。
 * 宣言が object で書かれていなければ null（読めないものは見ない）
 */
export const endpointCallOf = (node, createEndpointNames) => {
  const callee = node.callee;
  if (callee?.type !== "Identifier" || !createEndpointNames.has(callee.name))
    return null;
  const config = unwrap(node.arguments[0]);
  if (config?.type !== "ObjectExpression") return null;

  return { config, handler: node.arguments[1] };
};

/** `createEndpoint(...)` の呼び出しか（config の形は見ない。export の値が createEndpoint かだけ見るときに使う） */
export const isCreateEndpointCall = (node, createEndpointNames) =>
  node?.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  createEndpointNames.has(node.callee.name);
