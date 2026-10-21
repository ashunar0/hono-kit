/** HTTP の入口か（src/routes/ のリソース。webhook もここ）。endpoint を書く場所 */
export const isHttpEntry = (file) =>
  /[/\\]src[/\\]routes[/\\](?:.+[/\\])?index\.ts$/.test(file);

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

/**
 * guard の名前。「guard は要求するものの名前を持つ」に乗るので、
 * 維持するリストを持たない。requireAdmin を足しても規則の変更は要らない
 */
const GUARD_NAME = /^(require|allow)[A-Z]/;

/** `requireAuth`, or a guard built by a call (`requireRole("admin")`) */
export const isGuardName = (node) =>
  (node?.type === "Identifier" && GUARD_NAME.test(node.name)) ||
  (node?.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    GUARD_NAME.test(node.callee.name));

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
 * endpoint の宣言の呼び出し `export const GET = createEndpoint(config, fn)`。
 * 宣言が object で書かれていなければ null（読めないものは見ない）
 */
export const endpointCallOf = (node) => {
  const callee = node.callee;
  if (callee?.type !== "Identifier" || callee.name !== "createEndpoint")
    return null;
  const config = unwrap(node.arguments[0]);
  if (config?.type !== "ObjectExpression") return null;

  return { config, handler: node.arguments[1] };
};
