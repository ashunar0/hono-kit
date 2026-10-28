/**
 * /redirects: redirects to the query's next, to check which locations reply.redirect lets through
 */
import { createEndpoint, redirect } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "hono-kit";

export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    request: { query: z.object({ next: z.string() }) },
    responses: { 303: redirect({ origins: ["https://accounts.example.com"] }) },
  },
  async (c, reply) => reply.redirect(c.req.valid("query").next),
);
