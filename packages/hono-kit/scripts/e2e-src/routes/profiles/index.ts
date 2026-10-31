/**
 * /profiles: returns a row as it is, with a key the declaration does not have. ?broken=1 returns a value that only
 * claims its type. The success body is checked while it runs: the extra key is left out, and the broken one is a 500
 */
import { allowAnonymous, createEndpoint } from "hono-kit";
import { z } from "zod";

const profile = z.object({ name: z.string() });

export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    request: { query: z.object({ broken: z.literal("1").optional() }) },
    responses: { 200: profile },
  },
  async (c, reply) => {
    if (c.req.valid("query").broken)
      return reply.success({ name: 1 } as unknown as { name: string });
    const row = { name: "hono", passwordHash: "secret" };
    return reply.success(row);
  },
);
