/**
 * hono-kit-ui on the server: what a page draws. Islands are not drawn with <Island> by hand: the Vite plugin
 * (hono-kit-ui/vite) wraps the default export of each *.island.tsx with it
 */
import type { Child, FC } from "hono/jsx";

/**
 * The props of an island that is listed more than once on a page (one per row). islandKey tells them apart,
 * as key does in a list: when the page is swapped, an island stays with the one of the same key, not the one
 * in the same place. The island itself never gets it. (hono/jsx gives no way to add an attribute to every
 * component, as React's key is: its IntrinsicAttributes cannot be augmented from outside)
 */
export type Keyed<P> = P & { islandKey?: string };

/**
 * Draws an island on the server inside a mark, so the browser (hono-kit-ui/client) starts it there. props go to the browser as JSON
 * (as in Astro, everything passed is sent: pass only what the island needs)
 */
export const Island = <P extends object>({
  name,
  component: Component,
  props: { islandKey, ...props },
}: {
  name: string;
  component: FC<P>;
  props: P & { islandKey?: string };
}) => (
  <div
    data-island={name}
    data-island-key={islandKey}
    data-props={JSON.stringify(props)}
    style="display: contents"
  >
    <Component {...(props as P)} />
  </div>
);

/**
 * A link that moves to the page without loading it (hono-kit-ui/client), as Inertia's <Link>.
 * It is an <a> all the same: a new tab or no script still works. preserveState keeps the islands as they are
 */
export const Link = ({
  href,
  preserveState = false,
  children,
}: {
  href: string;
  preserveState?: boolean;
  children: Child;
}) => (
  <a href={href} data-link="" data-preserve-state={preserveState ? "" : undefined}>
    {children}
  </a>
);
