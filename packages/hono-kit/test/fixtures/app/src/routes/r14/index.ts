import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";
import { InvalidSignature } from "./_errors";

export const POST = createEndpoint(
  {
    auth: requireAuth,
    responses: {},
  },
  async () => {
    throw InvalidSignature;
  },
);
