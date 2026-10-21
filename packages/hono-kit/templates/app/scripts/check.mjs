/**
 * pnpm check. Runs every check in order, keeps going when one fails, and lists the failures at the end.
 * So a type error does not hide the lint findings (you would not know how much there is to fix)
 */
import { spawnSync } from "node:child_process";

const steps = [
  // With a stale routes.gen.ts, types and tests see old routes. On CI (CI is set) only compare, so a stale one that was committed fails
  ["routes.gen.ts", ["pnpm", "hnk", "gen", ...(process.env.CI ? ["--check"] : [])]],
  ["typecheck", ["pnpm", "typecheck"]],
  ["lint", ["pnpm", "lint"]],
  ["format:check", ["pnpm", "format:check"]],
  ["test", ["pnpm", "test"]],
];

const failed = [];
for (const [name, [command, ...args]] of steps) {
  console.log(`\n── ${name} ──`);
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  if (status !== 0) failed.push(name);
}

if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nAll checks passed");
