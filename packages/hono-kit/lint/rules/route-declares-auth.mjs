import { endpointCallOf, isGuardName, isHttpEntry, unwrap } from "../ast.mjs";
import { fileOf } from "../project.mjs";

/**
 * 認証について決めたことを宣言に書かせる。
 *
 * guard を落としても、handler が actor を読まなければ tsc は通る。
 * 読まない handler —— 所有者で絞らない集計など —— では、書き忘れが
 * 無認証の公開として静かに出ていく。
 *
 * 公開したいときは allowAnonymous を書く。「書いていない」が
 * 「忘れた」と「公開したい」の両方を意味するのをやめる。
 * どちらが正しいかは機械には分からないが、grep allowAnonymous で列挙はできる
 */
export default {
  create(context) {
    if (!isHttpEntry(fileOf(context))) return {};

    return {
      CallExpression(node) {
        const call = endpointCallOf(node);
        if (!call) return;
        const { config } = call;

        const middleware = config.properties.find(
          (p) =>
            p.type === "Property" &&
            p.key?.type === "Identifier" &&
            p.key.name === "middleware",
        );
        const list = unwrap(middleware?.value);
        const elements =
          list?.type === "ArrayExpression" ? list.elements : list ? [list] : [];
        const guards = elements.filter(isGuardName);

        if (guards.length === 0) {
          context.report({
            node,
            message:
              "The endpoint does not declare auth. Put middleware: [requireAuth], or [allowAnonymous] if it is public",
          });
          return;
        }
        if (guards.length > 1) {
          context.report({
            node: guards[1],
            message: `${guards.length} auth guards are declared. Pick one`,
          });
        }
        if (elements[0] !== guards[0]) {
          context.report({
            node: guards[0],
            message:
              "Put the auth guard first in middleware, so the declaration reads top to bottom",
          });
        }
      },
    };
  },
};
