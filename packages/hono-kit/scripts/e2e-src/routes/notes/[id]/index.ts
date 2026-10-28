/**
 * /notes/:id
 */
import { eq } from "drizzle-orm";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { z } from "zod";
import { notesTable } from "#src/db/schema";
import { requireAuth } from "hono-kit";
import { noteResponse, noteResponseSchema } from "../_response";

export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: noteResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply) => {
    const { db } = c.var.deps;
    const [note] = await db
      .select()
      .from(notesTable)
      .where(eq(notesTable.id, c.req.valid("param").id))
      .limit(1);
    if (note === undefined) return reply.failure(NotFound.code);

    return reply.success(noteResponse(note));
  },
);
