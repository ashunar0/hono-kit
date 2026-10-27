/**
 * Responses in several formats from the same data. `200: { "application/json": schema, "text/html": (data) => <Page /> }`.
 * The handler passes the data once (reply.success(data)); which format is sent is chosen from the request's Accept,
 * so no handler branches on headers. With no Accept, or `*\/*`, the first one declared is sent
 */
import type { HtmlEscapedString } from "hono/utils/html";

import type { AnySchema } from "./route-types.js";

/** What a renderer returns. JSX from hono/jsx, or a string */
export type Rendered =
  | string
  | HtmlEscapedString
  | Promise<string | HtmlEscapedString>;

/**
 * Turns the data into one format (`text/html`, `text/markdown`, ...). Annotate its parameter (`(invoice: Invoice) => ...`):
 * left out, it is unknown. Written as a method so that an annotated parameter is accepted
 */
export type Renderer = { render(data: unknown): Rendered }["render"];

/** Formats by media type. `application/json` takes a schema, the others a renderer */
export type ContentMap = {
  readonly [media: `${string}/${string}`]: AnySchema | Renderer;
};

/** A content map is the only response declaration that is a plain object keyed by media types */
export const isContentMap = (entry: unknown): entry is ContentMap =>
  typeof entry === "object" &&
  entry !== null &&
  !("~standard" in entry) &&
  Object.keys(entry).length > 0 &&
  Object.keys(entry).every((key) => key.includes("/"));

type Range = { type: string; subtype: string; q: number };

const rangesOf = (accept: string): Range[] =>
  accept.split(",").flatMap((part) => {
    const [media = "", ...params] = part.split(";").map((p) => p.trim());
    const [type, subtype] = media.toLowerCase().split("/");
    if (!type || !subtype) return [];
    const q = params
      .map((p) => /^q=([0-9.]+)$/i.exec(p)?.[1])
      .find((v) => v !== undefined);
    return [{ type, subtype, q: q === undefined ? 1 : Number(q) }];
  });

/** How much the client wants this media type: the q of the most specific range that matches it, 0 if none does */
const qualityOf = (media: string, ranges: Range[]) => {
  const [type, subtype] = media.toLowerCase().split("/");
  let best: { specificity: number; q: number } | undefined;
  for (const range of ranges) {
    const specificity =
      range.type === type && range.subtype === subtype
        ? 3
        : range.type === type && range.subtype === "*"
          ? 2
          : range.type === "*" && range.subtype === "*"
            ? 1
            : 0;
    if (specificity > (best?.specificity ?? 0))
      best = { specificity, q: range.q };
  }
  return best?.q ?? 0;
};

/**
 * The declared media type to send, or undefined when the client accepts none of them (406).
 * The highest q wins; on a tie, the one declared first
 */
export const negotiate = (
  accept: string | undefined,
  declared: readonly string[],
): string | undefined => {
  const ranges = accept ? rangesOf(accept) : [];
  if (ranges.length === 0) return declared[0];

  let chosen: { media: string; q: number } | undefined;
  for (const media of declared) {
    const q = qualityOf(media, ranges);
    if (q > 0 && q > (chosen?.q ?? 0)) chosen = { media, q };
  }
  return chosen?.media;
};
