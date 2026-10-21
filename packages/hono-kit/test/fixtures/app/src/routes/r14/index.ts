import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";
import { InvalidSignature } from "./_errors";

export const POST = createEndpoint(
  {
    middleware: [requireAuth] as const,
    responses: {},
  },
  async () => {
    throw InvalidSignature;
  },
);
