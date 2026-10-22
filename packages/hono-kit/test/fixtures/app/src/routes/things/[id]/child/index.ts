import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../../middleware/auth";
import { thingResponse } from "../../_response";

export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, reply) => reply(200, thingResponse({ id: "x" })),
);
