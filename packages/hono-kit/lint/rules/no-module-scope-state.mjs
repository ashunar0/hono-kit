import { reportWithDocs } from "../docs.mjs";
import { unwrap } from "../ast.mjs";

/**
 * モジュールの一番上に、変わる状態を置かない。Workers では 1 つの isolate が
 * 同時に複数のリクエストを捌くので、ここに置いたものは全リクエストで共有され、
 * 別の利用者のデータが混ざる。リクエストごとのものは makeDeps か c に置く
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "rules.md");
    const MUTABLE = new Set(["Map", "Set", "WeakMap", "WeakSet", "Array"]);

    return {
      Program(program) {
        for (const statement of program.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration"
              ? statement.declaration
              : statement;
          if (declaration?.type !== "VariableDeclaration") continue;

          if (declaration.kind !== "const") {
            report({
              node: declaration,
              message: `${declaration.kind} at module scope. It is shared across concurrent requests, so do not keep changing values here`,
            });
            continue;
          }
          for (const declarator of declaration.declarations) {
            const init = unwrap(declarator.init);
            if (
              init?.type === "NewExpression" &&
              MUTABLE.has(init.callee?.name)
            ) {
              report({
                node: declarator,
                message: `new ${init.callee.name}() at module scope. It is shared across concurrent requests, so do not keep mutable containers here`,
              });
            }
          }
        }
      },
    };
  },
};
