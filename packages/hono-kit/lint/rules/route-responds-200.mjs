import { reportWithDocs } from "../docs.mjs";
import { endpointCallOf, isHttpEntry, unwrap } from "../ast.mjs";
import { fileOf } from "../project.mjs";

/**
 * 成功は 200 だけ。作ったら作ったものを 200、消したら { ok: true } を 200 で返す。
 * 201 や 204 を endpoint ごとに選べると、同じ docs から書いても応答の形が人によって割れる
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "rules.md");
    if (!isHttpEntry(fileOf(context))) return {};

    return {
      CallExpression(node) {
        const call = endpointCallOf(node);
        if (!call) return;
        const { config } = call;
        const responses = config.properties.find(
          (p) =>
            p.type === "Property" &&
            p.key?.type === "Identifier" &&
            p.key.name === "responses",
        );
        const value = unwrap(responses?.value);
        if (value?.type !== "ObjectExpression") return;

        for (const p of value.properties) {
          if (p.type !== "Property") continue;
          const status = Number(p.key?.value ?? p.key?.name);
          if (status >= 200 && status < 300 && status !== 200)
            report({
              node: p.key,
              message: `Success is always 200. Create returns the created thing with 200; delete returns { ok: true } with 200. Declare 200 instead of ${status}`,
            });
        }
      },
    };
  },
};
