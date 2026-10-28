/**
 * /pages/:id: a page that can fail every way, to check the app's error page.
 * "missing" is a declared failure, "boom" an unexpected one
 */
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "hono-kit";

const page = z.object({ id: z.string() });
type Page = z.infer<typeof page>;

export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { param: z.object({ id: z.string() }) },
    responses: {
      200: {
        "application/json": page,
        "text/html": (data: Page) => <h1>{data.id}</h1>,
      },
      ...errorResponses(NotFound),
    },
  },
  async (c, reply) => {
    const { id } = c.req.valid("param");
    if (id === "missing") return reply.failure(NotFound.code);
    if (id === "boom") throw new Error("boom");
    return reply.success({ id });
  },
);
