import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

export const POST = createEndpoint(
  {
    auth: requireAuth,
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
