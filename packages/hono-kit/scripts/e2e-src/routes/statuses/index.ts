/**
 * /statuses: three failures on one status (409, one with details) and one on 502, to check the client's types
 */
import { createEndpoint, errorResponses } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "#src/middleware/auth";
import { OverLimit, Starting, Taken, UpstreamFailed } from "./_errors";

export const POST = createEndpoint(
  {
    auth: allowAnonymous,
    request: { json: z.object({ kind: z.enum(["taken", "starting", "over", "upstream"]) }) },
    responses: {
      200: z.object({ ok: z.literal(true) }),
      ...errorResponses(Taken, Starting, OverLimit, UpstreamFailed),
    },
  },
  async (c, reply) => {
    const { kind } = c.req.valid("json");
    if (kind === "taken") return reply.failure(Taken.code);
    if (kind === "starting") return reply.failure(Starting.code);
    if (kind === "over")
      return reply.failure({ code: OverLimit.code, details: { limit: 3, requested: 5 } });
    return reply.failure(UpstreamFailed.code);
  },
);
