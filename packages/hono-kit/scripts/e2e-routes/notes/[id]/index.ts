/**
 * /notes/:id
 */
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "#src/middleware/auth";
import { noteIdSchema } from "#src/domains/notes/model";
import { noteResponse, noteResponseSchema } from "../_response";

export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    request: { param: z.object({ id: noteIdSchema }) },
    responses: { 200: noteResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply, { notesQueries }) => {
    const note = await notesQueries.get(c.req.valid("param").id);
    if (note === null) return reply.failure(NotFound.code);

    return reply(200, noteResponse(note));
  },
);
