import { reportWithDocs } from "../docs.mjs";
import {
  createEndpointNamesOf,
  isCreateEndpointCall,
  isHttpEntry,
  unwrap,
} from "../ast.mjs";
import { fileOf } from "../project.mjs";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const otherExport = (name) =>
  `${name} is exported from an HTTP entry file (index.ts). Only GET / POST / PUT / PATCH / DELETE may be exported here, each created with createEndpoint. Move other exports to a file that starts with _ (e.g. _response.ts), or keep it unexported`;

const notCreateEndpoint = (name) =>
  `${name} is exported but its value is not created with createEndpoint. Declare it as \`export const ${name} = createEndpoint({ auth, responses }, handler)\`, so auth and the responses contract are not skipped`;

const RE_EXPORT =
  "Do not re-export from an HTTP entry file. Only GET / POST / PUT / PATCH / DELETE, each created with createEndpoint, may be exported here";

const NO_DEFAULT =
  "Do not export default from an HTTP entry file. Export one method per constant: `export const GET = createEndpoint(...)`";

/**
 * index.ts（HTTP の入口）の export は、GET / POST / PUT / PATCH / DELETE だけ、
 * それぞれ `export const X = createEndpoint(...)` の形で書く。
 *
 * registerEndpoint は型で createEndpoint の戻り値しか受け付けないが、それは tsc が見える場所の話。
 * 素の配列を export していても、hnk prepare は endpoint として同じように拾ってしまう。
 * export の形をここで決めておけば、認証も responses の契約も持たないものが index.ts に紛れ込めない
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "resources.md");
    if (!isHttpEntry(fileOf(context))) return {};
    const createEndpointNames = createEndpointNamesOf();

    return {
      Program: createEndpointNames.Program,
      ExportDefaultDeclaration(node) {
        report({ node, message: NO_DEFAULT });
      },
      ExportAllDeclaration(node) {
        report({ node, message: RE_EXPORT });
      },
      ExportNamedDeclaration(node) {
        // export type ... / export type { ... } は値を持たないので endpoint ではない。許す
        if (node.exportKind === "type") return;

        if (node.source) {
          report({ node, message: RE_EXPORT });
          return;
        }

        if (!node.declaration) {
          // export { x }, export { x as GET }: その場の createEndpoint 呼び出しの形ではないので、
          // GET という名前でも通さない（宣言が別の場所にあると、認証や responses が読みづらくなる）
          for (const spec of node.specifiers) {
            if (spec.exportKind === "type") continue;
            const name = spec.exported?.name ?? spec.exported?.value;
            report({
              node: spec,
              message: METHODS.has(name)
                ? notCreateEndpoint(name)
                : otherExport(name),
            });
          }
          return;
        }

        const { declaration } = node;
        if (declaration.type !== "VariableDeclaration") {
          // export function X() {} / export class X {}: createEndpoint の呼び出しではあり得ない
          const name = declaration.id?.name ?? "this export";
          report({
            node: declaration,
            message: METHODS.has(name)
              ? notCreateEndpoint(name)
              : otherExport(name),
          });
          return;
        }

        for (const declarator of declaration.declarations) {
          const name =
            declarator.id?.type === "Identifier" ? declarator.id.name : null;
          if (name === null) {
            report({ node: declarator, message: otherExport("this export") });
            continue;
          }
          if (!METHODS.has(name)) {
            report({ node: declarator, message: otherExport(name) });
            continue;
          }
          if (
            !isCreateEndpointCall(
              unwrap(declarator.init),
              createEndpointNames.names,
            )
          )
            report({ node: declarator, message: notCreateEndpoint(name) });
        }
      },
    };
  },
};
