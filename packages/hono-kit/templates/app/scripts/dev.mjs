/**
 * pnpm dev. Runs wrangler dev and keeps routes.gen.ts in step with src/routes (hnk prepare --watch).
 * Without the watcher, an endpoint you add is not registered until you run hnk prepare by hand.
 * Arguments go to wrangler dev (pnpm dev --port 8788). When one of the two stops, the other is stopped too
 */
import { spawn } from "node:child_process";

const children = [
  spawn("pnpm", ["hnk", "prepare", "--watch"], { stdio: "inherit" }),
  spawn("pnpm", ["exec", "wrangler", "dev", ...process.argv.slice(2)], { stdio: "inherit" }),
];

const stop = (signal) => {
  for (const child of children) child.kill(signal);
};

for (const child of children) {
  child.on("exit", (code) => {
    stop("SIGTERM");
    process.exit(code ?? 0);
  });
}
// Killed on its own (not Ctrl+C, which reaches the children too): pass the signal on
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
