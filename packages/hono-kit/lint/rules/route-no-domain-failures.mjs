import { reportWithDocs } from "../docs.mjs";
import { isHttpEntry } from "../ast.mjs";
import {
  fileOf,
  placeOf,
  projectOf,
  resolveImport,
} from "../project.mjs";

/** `X` か `X.code` なら X の名前 */
const failureNameOf = (arg) => {
  if (arg?.type === "Identifier") return arg.name;
  if (
    arg?.type === "MemberExpression" &&
    !arg.computed &&
    arg.object?.type === "Identifier" &&
    arg.property?.name === "code"
  )
    return arg.object.name;
  return null;
};

/**
 * domain の model にある Failure は、その domain のルールの失敗。ルールはどの入口から呼んでも守るので service が決め、
 * handler は service の結果（result.error）を返すだけにする。handler が自分で返すと、cron や queue から呼んだときに
 * そのルールが効かない。入口だけの失敗は src/routes/<名詞>/_errors.ts、401 / 403 / 404 は hono-kit のものを使う
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "cross-domain.md");
    const file = fileOf(context);
    if (!isHttpEntry(file)) return {};
    const project = projectOf(file);
    if (!project) return {};

    /** domain の model から import した名前 → domain 名 */
    const domainValues = new Map();
    /** hono-kit から import した fail の名前（別名を含む） */
    const failNames = new Set();
    const check = (node, arg) => {
      const name = failureNameOf(arg);
      const domain = name && domainValues.get(name);
      if (!domain) return;
      report({
        node,
        message: `${name} is a failure of the ${domain} domain, so its service decides it, not the handler: pass what the handler read to the service as a value, and return the service's result.error. A failure only this entry has goes in _errors.ts`,
      });
    };

    return {
      // import がファイルのどこにあっても拾うよう、先に全部集める
      Program(program) {
        for (const node of program.body) {
          if (node.type !== "ImportDeclaration" || node.importKind === "type")
            continue;
          const specifier = node.source.value;
          if (specifier === "hono-kit") {
            for (const s of node.specifiers) {
              if (s.type === "ImportSpecifier" && s.imported?.name === "fail")
                failNames.add(s.local.name);
            }
            continue;
          }
          const resolved = resolveImport(file, specifier, project);
          if (!resolved) continue;
          const place = placeOf(resolved, project.root);
          if (!place.domain || place.role !== "model") continue;
          for (const s of node.specifiers) {
            if (s.type === "ImportSpecifier" && s.importKind !== "type")
              domainValues.set(s.local.name, place.domain);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        // reply.failure(X.code)
        if (
          callee?.type === "MemberExpression" &&
          !callee.computed &&
          callee.object?.type === "Identifier" &&
          callee.object.name === "reply" &&
          callee.property?.name === "failure"
        )
          return check(node, node.arguments[0]);
        // throw fail(X)
        if (callee?.type === "Identifier" && failNames.has(callee.name))
          return check(node, node.arguments[0]);
      },
    };
  },
};
