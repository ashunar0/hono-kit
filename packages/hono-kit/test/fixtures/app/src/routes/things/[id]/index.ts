import { createEndpoint } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import { thing } from "../../../domains/a/model";
import { thingResponse } from "../_response";

const params = z.object({ id: z.string() });

export const GET = createEndpoint(
  {
    middleware: [requireAuth] as const,
    request: { param: params },
    responses: {},
  },
  async (_c, reply, { a }) => reply(200, thingResponse(await a.get(thing))),
);
