/**
 * Moving between pages and showing what the server has now, without loading the page again
 * (as Inertia's visits). The page's HTML is asked for and put in place of the body. Islands start again,
 * unless the state is kept: then each island on screen stays (what is typed, what is open) and gets the new page's props
 */
import { keepIsland, startIslands } from "./islands";

type SwapOptions = { preserveState: boolean; preserveScroll: boolean };

const swap = (next: Document, { preserveState, preserveScroll }: SwapOptions) => {
  if (preserveState) {
    // An island in the new page takes the one on screen with the same name and key. Without a key,
    // the n-th of a name takes the n-th; one whose key is gone from the page starts again
    const idOf = (element: HTMLElement) =>
      `${element.dataset.island ?? ""}\u0000${element.dataset.islandKey ?? ""}`;
    const live = new Map<string, HTMLElement[]>();
    for (const element of document.querySelectorAll<HTMLElement>("[data-island]")) {
      live.set(idOf(element), [...(live.get(idOf(element)) ?? []), element]);
    }
    for (const element of next.querySelectorAll<HTMLElement>("[data-island]")) {
      const kept = live.get(idOf(element))?.shift();
      if (kept) keepIsland(kept, element);
    }
  }
  const { scrollX, scrollY } = window;
  const focused = document.activeElement;
  document.title = next.title;
  document.body.replaceChildren(...next.body.childNodes);
  if (preserveScroll) window.scrollTo(scrollX, scrollY);
  else window.scrollTo(0, 0);
  if (focused instanceof HTMLElement && focused.isConnected) focused.focus();
};

const fetchPage = async (url: string) => {
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  // A redirect (signed out → /login) ends somewhere else: that is where the page now is
  return { url: res.url, page: new DOMParser().parseFromString(await res.text(), "text/html") };
};

/**
 * Opens another page. history gets the new URL ("push"), takes its place ("replace"),
 * or is left alone ("none", for the browser's back and forward)
 */
export const visit = async (
  url: string,
  {
    preserveState = false,
    history: entry = "push",
  }: { preserveState?: boolean; history?: "push" | "replace" | "none" } = {},
) => {
  const next = await fetchPage(url);
  if (entry === "push") history.pushState(null, "", next.url);
  if (entry === "replace" || (entry === "none" && next.url !== location.href))
    history.replaceState(null, "", next.url);
  swap(next.page, { preserveState, preserveScroll: false });
  await startIslands(document);
};

/** Shows what the server has now on this page, after a write: the islands and the scroll stay */
export const refreshPage = async () => {
  const next = await fetchPage(location.href);
  swap(next.page, { preserveState: true, preserveScroll: true });
  await startIslands(document);
};

/**
 * Makes the <Link>s (a[data-link]) move without loading the page, and the browser's back and forward too.
 * A click with a modifier key (a new tab) or on another site is the browser's, as usual
 */
export const listenToLinks = () => {
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-link]");
    if (!link || link.origin !== location.origin) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    void visit(link.href, { preserveState: link.dataset.preserveState !== undefined });
  });
  window.addEventListener("popstate", () => void visit(location.href, { history: "none" }));
};
