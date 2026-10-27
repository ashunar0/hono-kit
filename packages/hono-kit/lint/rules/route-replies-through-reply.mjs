import { reportWithDocs } from "../docs.mjs";
import { isHttpEntry } from "../ast.mjs";
import { fileOf } from "../project.mjs";

const RESPONSE_METHODS = new Set(["json", "text", "body", "html", "redirect"]);

/**
 * route では reply で返す。c.json でも動くが、宣言とずれたときの赤線が
 * 間違えた値ではなく handler の頭に付き、何を直せばいいかが読めなくなる。
 * HTML・ファイル・リダイレクトも reply から返せるので、c.html / c.body / c.redirect も止める
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "rules.md");
    if (!isHttpEntry(fileOf(context))) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee?.type !== "MemberExpression") return;
        if (callee.object?.type !== "Identifier" || callee.object.name !== "c")
          return;
        const method = callee.property?.name;
        if (!RESPONSE_METHODS.has(method)) return;
        report({
          node,
          message: `Return with reply instead of c.${method}(): reply.success(body), reply.failure(code) or reply.redirect(location). To return HTML or a file, declare it in responses (200: { "text/html": (data) => ... } or 200: file())`,
        });
      },
    };
  },
};
