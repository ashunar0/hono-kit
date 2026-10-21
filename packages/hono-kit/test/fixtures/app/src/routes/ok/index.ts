import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

export const POST = createEndpoint(
  {
    middleware: [requireAuth] as const,
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
