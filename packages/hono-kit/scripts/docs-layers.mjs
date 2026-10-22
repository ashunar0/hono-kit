/**
 * docs/layout.md の許可表を、lint の LAYERS から作る。
 * `node scripts/docs-layers.mjs` で docs を書き換え、`--check` では食い違いを調べるだけ
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { LAYERS, NOTES } from "../lint/layers.mjs";

const doc = fileURLToPath(new URL("../docs/layout.md", import.meta.url));
const START = "<!-- layers:start";
const START_LINE =
  "<!-- layers:start (generated from lint/layers.mjs; do not edit by hand) -->";
const END = "<!-- layers:end -->";

const show = (name) => name.replace(/^foreign:/, "another domain's ");

const table = () => {
  const rows = Object.entries(LAYERS).map(([role, allowed]) => {
    const list = Object.entries(allowed)
      .map(([k, v]) => (v === "type" ? `${show(k)} (types only)` : show(k)))
      .join(", ");
    const note = NOTES[role] ? `. ${NOTES[role]}` : "";
    return `| ${role} | ${list}${note} |`;
  });
  return ["| Role | May import |", "| --- | --- |", ...rows].join("\n");
};

const before = fs.readFileSync(doc, "utf8");
const start = before.indexOf(START);
const end = before.indexOf(END);
if (start === -1 || end === -1) {
  console.error("docs/layout.md has no layers:start / layers:end markers");
  process.exit(1);
}
const merged = `${before.slice(0, start)}${START_LINE}\n\n${table()}\n\n${before.slice(end)}`;
const after = await prettier.format(merged, { filepath: doc });

if (process.argv.includes("--check")) {
  if (after !== before) {
    console.error(
      "The table in docs/layout.md is out of sync with layers.mjs. Regenerate it with `pnpm -C packages/hono-kit docs:layers`",
    );
    process.exit(1);
  }
} else {
  fs.writeFileSync(doc, after);
}
