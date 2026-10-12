/**
 * How a note is shown over HTTP. Not a rule of the note, so it lives with the resource, not the module.
 * Another resource that shows notes imports it from here
 */
import { z } from "zod";
import type { Note } from "../../modules/notes/domain";

export const noteResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

type NoteResponse = z.infer<typeof noteResponseSchema>;

// Thing → response. Do not return the thing as is; map it to what is shown
export function noteResponse(note: Note): NoteResponse {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt.getTime(),
    updatedAt: note.updatedAt.getTime(),
  };
}
