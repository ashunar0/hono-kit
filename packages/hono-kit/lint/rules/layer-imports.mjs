import {
  fileOf,
  packageOf,
  placeOf,
  projectOf,
  resolveImport,
} from "../project.mjs";
import { HINTS, KINDS, KIND_HINTS, LAYERS } from "../layers.mjs";

/** foreign:domain → 他 module の domain */
const show = (name) => name.replace(/^foreign:/, "another module's ");

/** 他の module の repo から借りてよい名前。外部キーの表と、読ませる窓口 */
const WINDOW = /(Table|Within)$/;

const isTypeOnly = (node) =>
  node.importKind === "type" ||
  (node.specifiers?.length > 0 &&
    node.specifiers.every((s) => s.importKind === "type"));

/**
 * 役割ごとの依存の向きを、許可の表（LAYERS）で守らせる。
 * Go は package の境界が向きを強制するが、ここでは 1 つの module フォルダに
 * 役割が同居しているので、ファイル名の約束を機械で止める
 */
export default {
  create(context) {
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const self = placeOf(file, project.root);
    if (self.role === "test") return {};
    const allowed = LAYERS[self.role];
    if (!allowed) {
      if (!self.module) return {};
      // module の中に、役割の分からないファイルを置かせない
      return {
        Program(node) {
          context.report({
            node,
            message: `Files in a module start with their role (${Object.keys(KINDS).join(", ")}). Outbound adapters are named "role.tech.ts" (repo.d1.ts, ...)`,
          });
        },
      };
    }

    const check = (node) => {
      if (!node.source) return;
      const specifier = node.source.value;
      const resolved = resolveImport(file, specifier, project);

      let target;
      if (resolved === null) target = packageOf(specifier);
      else {
        const place = placeOf(resolved, project.root);
        const foreign = place.module && place.module !== self.module;
        target = foreign ? `foreign:${place.role}` : place.role;
      }
      const kind = allowed[target];
      const targetRole = target.replace(/^foreign:/, "");
      const hint =
        HINTS[`${self.role}→${target}`] ??
        (KINDS[targetRole] && !target.startsWith("foreign:")
          ? KIND_HINTS[`${KINDS[self.role]}→${KINDS[targetRole]}`]
          : undefined);
      if (!kind) {
        const list = Object.entries(allowed)
          .map(([k, v]) => (v === "type" ? `${show(k)} (types only)` : show(k)))
          .join(", ");
        context.report({
          node,
          message: `${self.role} imports ${show(target)}. ${hint ? `${hint}. ` : ""}${self.role} may import: ${list}`,
        });
      } else if (kind === "type" && !isTypeOnly(node)) {
        context.report({
          node,
          message: `${self.role} may only borrow types from ${show(target)}. Use import type`,
        });
      } else if (target === "foreign:repo") {
        // 他の module の repo は、外部キーの表と、読ませる窓口だけを外に見せる
        for (const spec of node.specifiers ?? []) {
          const name =
            spec.type === "ImportSpecifier" ? spec.imported.name : undefined;
          if (name !== undefined && WINDOW.test(name)) continue;
          context.report({
            node: spec,
            message: `${self.role} imports ${name ?? "everything"} from another module's repo. From another module's repo you may borrow only foreign-key tables (…Table) and scoped reads (…Within). Keep steps and mapping inside that module; if needed, add a …Within there`,
          });
        }
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
