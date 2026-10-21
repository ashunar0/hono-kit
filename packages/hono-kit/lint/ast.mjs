/** HTTP の入口か（src/routes/ のリソース。webhook もここ）。createRouter の束を書く場所 */
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
 * 式の根まで降りて `createRouter()` かどうかを見る。
 * `createRouter().endpoint(...).endpoint(...)` はチェーンなので、
 * CallExpression と MemberExpression を剥がしてから判定する
 */
export const rootsAtCreateRouter = (node) => {
  let cur = node;
  let last;
  while (cur) {
    if (cur.type === "CallExpression") {
      last = cur;
      cur = cur.callee;
    } else if (cur.type === "MemberExpression") cur = cur.object;
    else break;
  }
  return (
    cur?.type === "Identifier" &&
    cur.name === "createRouter" &&
    last?.callee === cur
  );
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
 * endpoint の宣言の呼び出し。`export const GET = createEndpoint(config, fn)` と、`router.endpoint(config, fn)`。
 * 宣言が object で書かれていなければ null（読めないものは見ない）
 */
export const endpointCallOf = (node) => {
  const callee = node.callee;
  const created =
    callee?.type === "Identifier" && callee.name === "createEndpoint";
  const chained =
    callee?.type === "MemberExpression" && callee.property?.name === "endpoint";
  if (!created && !chained) return null;
  const config = unwrap(node.arguments[0]);
  if (config?.type !== "ObjectExpression") return null;

  return { config, handler: node.arguments[1], created };
};
