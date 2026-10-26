import { reportWithDocs } from "../docs.mjs";
import { fileOf, isTest, projectOf, relativeOf } from "../project.mjs";

/**
 * ID の印（InvoiceId など）を `as` で付けない。印を付けてよいのは、その ID の型を宣言しているファイル
 * （そこに置く作る関数 invoiceId(value) の定義）だけ。あちこちで as を書けると、取り違えを型で止める意味がなくなる。
 * TS の as は何でも何にでも変えられるので、型エラーを黙らせる抜け道になりやすい。
 * どこに宣言するか（どのディレクトリか）は見ない。同じファイルに `type …Id =` があるかだけを見る
 */
const declaredTypes = (program) => {
  const names = new Set();
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "TSTypeAliasDeclaration") names.add(declaration.id.name);
  }
  return names;
};

export default {
  create(context) {
    const report = reportWithDocs(context, "rules.md");
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    if (isTest(relativeOf(file, project))) return {};

    let declared = new Set();

    return {
      Program(program) {
        declared = declaredTypes(program);
      },
      TSAsExpression(node) {
        const type = node.typeAnnotation;
        if (type?.type !== "TSTypeReference") return;
        const name = type.typeName?.name;
        if (!name || !/Id$/.test(name) || declared.has(name)) return;
        report({
          node,
          message: `${name} is applied with as. Brand IDs only with the constructor next to the type (${name[0].toLowerCase()}${name.slice(1)}(value)), in the file that declares ${name}`,
        });
      },
    };
  },
};
