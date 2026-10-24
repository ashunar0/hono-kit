/**
 * /notes
 */
import { createEndpoint } from "hono-kit";
import { requireAuth } from "#src/middleware/auth";
import { noteResponse, noteResponseSchema } from "./_response";

/** Create. Read back through the same path as the GET */
export const POST = createEndpoint(
  { auth: requireAuth, responses: { 200: noteResponseSchema } },
  async (c, reply, { notes, notesQueries }) => {
    const id = await notes.write.create(c.get("now"));

    const note = await notesQueries.get(id);
    if (note === null) throw new Error(`note ${id} is gone right after the write`);

    return reply(200, noteResponse(note));
  },
);
