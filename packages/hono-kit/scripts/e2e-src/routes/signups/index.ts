/**
 * /signups: several fields and a nested list, to check what a 400 says about each field
 */
import { allowAnonymous, createEndpoint } from "hono-kit";
import { z } from "zod";

export const POST = createEndpoint(
  {
    auth: allowAnonymous,
    request: {
      json: z.object({
        email: z.email(),
        nickname: z.string().min(3).regex(/^[a-z]+$/),
        pets: z.array(z.object({ name: z.string().min(1) })),
      }),
    },
    responses: { 200: z.object({ ok: z.literal(true) }) },
  },
  async (_c, reply) => reply.success({ ok: true }),
);
