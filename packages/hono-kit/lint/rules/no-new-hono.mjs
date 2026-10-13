import path from "node:path";
import { fileOf, projectOf } from "../project.mjs";

/**
 * アプリの中で new Hono() を書かない。createRouter() は deps・guard・responses の約束を運ぶので、
 * 素の Hono で作った router では、その約束が型にも lint にも乗らない
 */
export default {
  create(context) {
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const rel = path.relative(project.root, file).replace(/\\/g, "/");
    if (!rel.startsWith("src/") || /\.(test|typetest|spec)\.tsx?$/.test(rel))
      return {};

    return {
      NewExpression(node) {
        if (node.callee?.type === "Identifier" && node.callee.name === "Hono")
          context.report({
            node,
            message:
              "Do not write new Hono(). Use createRouter() from hono-kit: it carries deps, guards and the responses contract",
          });
      },
    };
  },
};
