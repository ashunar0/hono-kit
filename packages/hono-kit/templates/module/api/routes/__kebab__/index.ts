/**
 * /notes. The resource for notes: what a client points at. How a note is shown is in response.ts
 */
import {
  createRouter,
  errorResponses,
  NotFound,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
} from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { noteIdSchema, noteInputSchema } from "../../modules/notes/domain";
import { noteResponse, noteResponseSchema } from "./response";

// What it receives. The body input is noteInputSchema from domain
const noteParamsSchema = z.object({
  id: noteIdSchema,
});

const listNotesQuerySchema = pageQuerySchema();

const listNotesResponseSchema = pageResponseSchema(noteResponseSchema);

const deleteNoteResponseSchema = z.object({
  ok: z.literal(true),
});

export const notesRouter = createRouter()
  // List
  .endpoint(
    {
      method: "get",
      path: "/",
      middleware: [requireAuth],
      request: { query: listNotesQuerySchema },
      responses: {
        200: listNotesResponseSchema,
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { cursor, limit } = c.req.valid("query");

      const page = await notes.list(actor, { after: cursor, limit });

      return reply(200, pageResponse(page, noteResponse));
    },
  )
  // One
  .endpoint(
    {
      method: "get",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: noteParamsSchema },
      responses: {
        200: noteResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const result = await notes.get(actor, id);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, noteResponse(result.value));
    },
  )
  // Create
  .endpoint(
    {
      method: "post",
      path: "/",
      middleware: [requireAuth],
      request: { json: noteInputSchema },
      responses: {
        200: noteResponseSchema,
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const now = new Date();

      const created = await notes.create(actor, input, now);

      return reply(200, noteResponse(created));
    },
  )
  // Update
  .endpoint(
    {
      method: "put",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: noteParamsSchema, json: noteInputSchema },
      responses: {
        200: noteResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const now = new Date();

      const result = await notes.update(actor, id, input, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, noteResponse(result.value));
    },
  )
  // Delete
  .endpoint(
    {
      method: "delete",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: noteParamsSchema },
      responses: {
        200: deleteNoteResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const result = await notes.remove(actor, id);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { ok: true });
    },
  );
