import { reportWithDocs } from "../docs.mjs";
import path from "node:path";
import { fileOf, projectOf } from "../project.mjs";

/**
 * アプリの中で new Hono() を書かない。根は createApp() で作る。Env がアプリの Register になるので、
 * c.get("actor") や c.get("now") に型が付く。endpoint は createEndpoint で書き、hnk prepare が登録する
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "resources.md");
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const rel = path.relative(project.root, file).replace(/\\/g, "/");
    if (!rel.startsWith("src/") || /\.(test|typetest|spec)\.tsx?$/.test(rel))
      return {};

    return {
      NewExpression(node) {
        if (node.callee?.type === "Identifier" && node.callee.name === "Hono")
          report({
            node,
            message:
              "Do not write new Hono(). Make the app's root with createApp() from hono-kit (its Env is the app's), and write endpoints with createEndpoint under src/routes",
          });
      },
    };
  },
};
