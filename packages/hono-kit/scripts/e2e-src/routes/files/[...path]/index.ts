/**
 * /files/*: catch-all. Every segment after /files/ comes as one param, slashes included
 */
import { createEndpoint } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "#src/middleware/auth";

export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    request: { param: z.object({ path: z.string() }) },
    responses: { 200: z.object({ path: z.string() }) },
  },
  async (c, reply) => reply.success({ path: c.req.valid("param").path }),
);
