/**
 * Starts the islands the server marked (<div data-island="name" data-props="…">) with the component of
 * src/<name>.island.tsx and the props the server gave it. One already started (data-started) is left as it is.
 * The files come from the app (import.meta.glob in its client script), since a glob is read where it is written
 */
import { useState, type FC } from "hono/jsx";
import { render } from "hono/jsx/dom";

/** import.meta.glob("/src/**\/*.island.tsx") of the app */
export type IslandFiles = Record<string, () => Promise<unknown>>;

let islands: IslandFiles = {};

export const useIslandFiles = (files: IslandFiles) => {
  islands = files;
};

type Props = Record<string, unknown>;

/** An island on screen, with a way to give it new props without losing its state */
type StartedIsland = HTMLElement & { updateProps?: (props: Props) => void };

export const startIslands = async (root: ParentNode) => {
  for (const element of root.querySelectorAll<StartedIsland>("[data-island]")) {
    if (element.dataset.started !== undefined) continue;
    element.dataset.started = "";
    const name = element.dataset.island;
    const load = islands[`/src/${name}.island.tsx`];
    if (load === undefined) {
      console.error(`No island src/${name}.island.tsx`);
      continue;
    }
    const { default: Component } = (await load()) as { default: FC };
    // The props live in a frame around the component, so new ones re-render it and keep its state
    const Frame = ({ initial }: { initial: Props }) => {
      const [props, setProps] = useState(initial);
      element.updateProps = setProps;
      return <Component {...props} />;
    };
    // hono/jsx/dom has no real hydration yet: render draws it again over what the server drew
    render(<Frame initial={JSON.parse(element.dataset.props ?? "{}") as Props} />, element);
  }
};

/** Keeps an island on screen in place of the same one in a new page, with the new page's props (as Inertia and Astro do) */
export const keepIsland = (kept: StartedIsland, next: HTMLElement) => {
  const props = next.dataset.props ?? "{}";
  if (kept.dataset.props !== props) {
    kept.dataset.props = props;
    kept.updateProps?.(JSON.parse(props) as Props);
  }
  next.replaceWith(kept);
};
