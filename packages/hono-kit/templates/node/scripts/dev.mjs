/**
 * pnpm dev. Keeps src/routes.gen.ts up to date (hnk prepare --watch) while the server restarts on changes (tsx watch).
 * Both stop together: Ctrl+C, or either one ending
 */
import { spawn } from "node:child_process";

const children = [
  spawn("pnpm", ["hnk", "prepare", "--watch"], { stdio: "inherit" }),
  spawn("pnpm", ["tsx", "watch", "src/server.ts"], { stdio: "inherit" }),
];
const stop = (code) => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
};
for (const child of children) child.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
