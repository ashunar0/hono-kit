import { createEndpoint } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import { thing } from "../../../domains/a/model";
import { thingResponse } from "../_response";

const params = z.object({ id: z.string() });

export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { param: params },
    responses: {},
  },
  async (c, reply) => reply.success(thingResponse(await c.var.deps.a.get(thing))),
);
