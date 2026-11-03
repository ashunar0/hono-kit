/**
 * hono-kit-ui in the browser. The app's client script calls start once:
 *
 *   import { start } from "hono-kit-ui/client";
 *   await start(import.meta.glob("/src/**\/*.island.tsx"));
 */
import { startIslands, useIslandFiles, type IslandFiles } from "./islands";
import { listenToLinks } from "./page";

export { refreshPage, visit } from "./page";
export { useForm, type Failure } from "./use-form";

/** Starts the islands of the page, and makes <Link>s and back/forward move without loading the page */
export const start = async (islands: IslandFiles) => {
  useIslandFiles(islands);
  listenToLinks();
  await startIslands(document);
};
