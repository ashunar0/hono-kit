/**
 * Vite で起動するアプリ用のプラグイン。アプリの vite.config.ts で `plugins: [honoKit()]` として読み込む。
 * dev と build の前に src/routes.gen.ts を書き、dev のあいだは src/routes が変われば書き直す（hnk prepare --watch の代わり）。
 * Vite を通さずに起動するアプリ（wrangler dev、bun --hot、tsx）は CLI の hnk prepare を使う
 */
import path from "node:path";
import { writeRoutes } from "../bin/prepare.mjs";

export const honoKit = () => {
  let src;
  let routes;
  let command;
  return {
    name: "hono-kit",
    configResolved(config) {
      src = path.join(config.root, "src");
      routes = path.join(src, "routes");
      command = config.command;
    },
    // build では止める（壊れた routes.gen.ts のまま出さない）。dev では理由を出して前の生成物のまま続ける
    buildStart() {
      if (!writeRoutes(src) && command === "build") this.error("src/routes.gen.ts not written (see above)");
    },
    configureServer(server) {
      const rewrite = (file) => {
        if (file.startsWith(routes + path.sep)) writeRoutes(src);
      };
      for (const event of ["add", "unlink", "change"]) server.watcher.on(event, rewrite);
    },
  };
};
