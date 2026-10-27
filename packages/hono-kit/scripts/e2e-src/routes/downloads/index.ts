/**
 * /downloads: returns a file as it is, to check file() and the Content-Type it is sent with
 */
import { createEndpoint, file } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "#src/middleware/auth";

export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    request: { query: z.object({ type: z.string().optional() }) },
    responses: { 200: file() },
  },
  async (c, reply) => {
    c.header("Cache-Control", "max-age=60");
    return reply.success({
      body: "a,b\n1,2\n",
      contentType: c.req.valid("query").type,
    });
  },
);
