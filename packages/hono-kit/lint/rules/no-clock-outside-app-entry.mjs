import { reportWithDocs } from "../docs.mjs";
import path from "node:path";
import { fileOf, placeOf, projectOf } from "../project.mjs";

/**
 * 時計を読むのは、アプリを組み立てる所（src/index.ts、src/server.ts、src/middleware/）とテストだけ。
 * HTTP は 1 リクエストに 1 回だけ読んで c.get("now") に積み、handler はそれを使う。job は渡された now を使う。
 * service より下は now を引数で受け取る。
 *
 * handler や job が new Date() を呼ぶと、テストで時刻を固定できない（日付をまたぐ瞬間に落ちるテストになる）。
 * 同じ手順が入口によって違う時計で動くこともある。
 * 引数の付いた new Date(value) は時計ではなく変換なので止めない
 */
// src/index.ts is seen as "src" (placeOf drops /index)
const ALLOWED = new Set(["test", "middleware", "src", "src/server"]);

export default {
  create(context) {
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const rel = path.relative(project.root, file).replace(/\\/g, "/");
    // Only app code in src/. Tests anywhere may read the clock
    if (!rel.startsWith("src/") || /\.(test|typetest|spec)\.tsx?$/.test(rel))
      return {};
    const self = placeOf(file, project.root);
    if (ALLOWED.has(self.role)) return {};

    const report = (node, what) =>
      reportWithDocs(
        context,
        "rules.md",
      )({
        node,
        message: `${self.role} reads the clock (${what}). The app reads it once, so tests can fix it: in a handler use c.get("now"), in a job the now it is passed, in service and below take now as an argument`,
      });

    return {
      NewExpression(node) {
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "Date" &&
          node.arguments.length === 0
        )
          report(node, "new Date()");
      },
      CallExpression(node) {
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          node.callee.object.name === "Date" &&
          node.callee.property?.name === "now"
        )
          report(node, "Date.now()");
      },
    };
  },
};
