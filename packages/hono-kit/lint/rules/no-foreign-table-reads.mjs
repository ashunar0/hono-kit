import { fileOf, placeOf, projectOf, resolveImport } from "../project.mjs";

/**
 * 他の domain の表（xxxTable）は、外部キーの references() の中でだけ使う。
 * 読むときは、持ち主が出している範囲付きの読み（invoicesWithin など）を通す。
 * 表を直接 from に書けると、範囲（組織）の条件を付け忘れる書き方ができてしまう。
 * GET の読み（src/routes/<名詞>/_queries.ts）は domain の外にあるので、どの domain の表も他人の表
 */
export default {
  create(context) {
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const self = placeOf(file, project.root);
    if ((!self.domain && self.role !== "queries") || self.role === "test")
      return {};

    /** 外部キーの references(...) の引数の中か */
    const insideReferences = (ancestors) =>
      ancestors.some(
        (a) =>
          a.type === "CallExpression" &&
          a.callee?.type === "MemberExpression" &&
          a.callee.property?.name === "references",
      );

    return {
      Program(program) {
        // 他 domain の repo から import した、表の名前
        const tables = new Map();
        for (const node of program.body) {
          if (node.type !== "ImportDeclaration") continue;
          const resolved = resolveImport(file, node.source.value, project);
          if (resolved === null) continue;
          const place = placeOf(resolved, project.root);
          if (
            !place.domain ||
            place.domain === self.domain ||
            place.role !== "repo"
          )
            continue;
          for (const spec of node.specifiers) {
            if (
              spec.type === "ImportSpecifier" &&
              /Table$/.test(spec.local.name)
            ) {
              tables.set(spec.local.name, place.domain);
            }
          }
        }
        if (tables.size === 0) return;

        const visit = (node, ancestors) => {
          if (!node || typeof node.type !== "string") return;
          if (node.type === "ImportDeclaration") return;
          if (
            node.type === "Identifier" &&
            tables.has(node.name) &&
            !insideReferences(ancestors)
          ) {
            context.report({
              node,
              message: `Reads another domain's table ${node.name}. Use tables only inside foreign-key references(). To read, use the scoped read (…Within) that ${tables.get(node.name)} exports`,
            });
          }
          for (const [key, value] of Object.entries(node)) {
            if (key === "parent") continue;
            for (const child of Array.isArray(value) ? value : [value]) {
              visit(child, [...ancestors, node]);
            }
          }
        };
        visit(program, []);
      },
    };
  },
};
