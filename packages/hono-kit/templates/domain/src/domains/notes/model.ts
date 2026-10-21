/**
 * The note. What it is and which rules it has (What).
 * It knows no steps, HTTP or DB. Every other file points here.
 *
 * Add the fields, the input schemas (zod), the failures (Failure) and, when someone may touch only some
 * notes, who reaches what (reachOf). How: node_modules/hono-kit/docs/domains.md
 */
import { z } from "zod";

/**
 * The note ID. A brand to tell it apart from a plain string.
 * Mixing it up with other IDs is a type error. Only noteId below may apply the brand
 */
declare const noteIdBrand: unique symbol;

export type NoteId = string & { readonly [noteIdBrand]: true };

/** Brands a string from outside or from the DB as a note ID. The only place that writes `as` */
export const noteId = (value: string) => value as NoteId;

export const newNoteId = () => noteId(crypto.randomUUID());

/** An ID in the input (URL or body). Branded once it passes validation */
export const noteIdSchema = z.string().min(1).transform(noteId);

export type Note = {
  id: NoteId;
  createdAt: Date;
  updatedAt: Date;
};
