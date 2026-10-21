import { reportWithDocs } from "../docs.mjs";
import { fileOf, placeOf, projectOf } from "../project.mjs";

/**
 * ID の印（InvoiceId など）を `as` で付けない。印を付けてよいのは、その ID を持つ domain の
 * model が出している作る関数（invoiceId(value)）だけ。あちこちで as を書けると、
 * 取り違えを型で止める意味がなくなる。model 自身の中（作る関数の定義）は許す
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "cross-domain.md");
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const self = placeOf(file, project.root);
    if (self.role === "model" || self.role === "test") return {};

    return {
      TSAsExpression(node) {
        const type = node.typeAnnotation;
        if (type?.type !== "TSTypeReference") return;
        const name = type.typeName?.name;
        if (!name || !/Id$/.test(name)) return;
        report({
          node,
          message: `${name} is applied with as. Brand IDs with the constructor in the owning domain's model (${name[0].toLowerCase()}${name.slice(1)}(value)). Where you cannot import values from another domain's model (service, ...), pass a plain string and brand it in deps.ts`,
        });
      },
    };
  },
};
