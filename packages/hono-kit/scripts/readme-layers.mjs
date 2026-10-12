/**
 * README の許可表（英語）を、lint の LAYERS から作る。
 * `node scripts/readme-layers.mjs` で README を書き換え、`--check` では食い違いを調べるだけ
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { KINDS, LAYERS, NOTES } from "../lint/layers.mjs";

const readme = fileURLToPath(new URL("../../../README.md", import.meta.url));
const START = "<!-- layers:start";
const START_LINE =
  "<!-- layers:start (generated from packages/hono-kit/lint/layers.mjs; do not edit by hand) -->";
const END = "<!-- layers:end -->";

const show = (name) => name.replace(/^foreign:/, "another module's ");

const table = () => {
  const rows = Object.entries(LAYERS).map(([role, allowed]) => {
    const list = Object.entries(allowed)
      .map(([k, v]) => (v === "type" ? `${show(k)} (types only)` : show(k)))
      .join(", ");
    const note = NOTES[role] ? `. ${NOTES[role]}` : "";
    return `| ${KINDS[role]} | ${role} | ${list}${note} |`;
  });
  return [
    "| Side | Role | May import |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
};

const before = fs.readFileSync(readme, "utf8");
const start = before.indexOf(START);
const end = before.indexOf(END);
if (start === -1 || end === -1) {
  console.error("README has no layers:start / layers:end markers");
  process.exit(1);
}
const merged = `${before.slice(0, start)}${START_LINE}\n\n${table()}\n\n${before.slice(end)}`;
const after = await prettier.format(merged, { filepath: readme });

if (process.argv.includes("--check")) {
  if (after !== before) {
    console.error(
      "The table in README is out of sync with layers.mjs. Regenerate it with `pnpm -C packages/hono-kit readme:layers`",
    );
    process.exit(1);
  }
} else {
  fs.writeFileSync(readme, after);
}
