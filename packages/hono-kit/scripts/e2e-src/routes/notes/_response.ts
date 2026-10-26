/**
 * How a note is shown over HTTP
 */
import { z } from "zod";
import type { notesTable } from "#src/db/schema";

export const noteResponseSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const noteResponse = (
  note: typeof notesTable.$inferSelect,
): z.infer<typeof noteResponseSchema> => ({
  id: note.id,
  createdAt: note.createdAt.getTime(),
  updatedAt: note.updatedAt.getTime(),
});
