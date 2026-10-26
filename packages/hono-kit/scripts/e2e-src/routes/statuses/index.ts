/**
 * /statuses: two failures on one status (409) and one on 502, to check the client's types
 */
import { createEndpoint, errorResponses } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "#src/middleware/auth";
import { Starting, Taken, UpstreamFailed } from "./_errors";

export const POST = createEndpoint(
  {
    auth: allowAnonymous,
    request: { json: z.object({ kind: z.enum(["taken", "starting", "upstream"]) }) },
    responses: {
      200: z.object({ ok: z.literal(true) }),
      ...errorResponses(Taken, Starting, UpstreamFailed),
    },
  },
  async (c, reply) => {
    const { kind } = c.req.valid("json");
    if (kind === "taken") return reply.failure(Taken.code);
    if (kind === "starting") return reply.failure(Starting.code);
    return reply.failure(UpstreamFailed.code);
  },
);
