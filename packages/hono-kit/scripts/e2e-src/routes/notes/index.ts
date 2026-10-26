/**
 * /notes
 */
import { createEndpoint } from "hono-kit";
import { notesTable } from "#src/db/schema";
import { requireAuth } from "#src/middleware/auth";
import { noteResponse, noteResponseSchema } from "./_response";

/** Create. The handler writes through the db from deps */
export const POST = createEndpoint(
  { auth: requireAuth, responses: { 200: noteResponseSchema } },
  async (c, reply, { db }) => {
    const now = c.get("now");
    const [note] = await db
      .insert(notesTable)
      .values({ id: crypto.randomUUID(), createdAt: now, updatedAt: now })
      .returning();
    if (note === undefined) throw new Error("the note was not written");

    return reply(200, noteResponse(note));
  },
);
