// expect: hnk(route-responds-200) | Success is always 200
import { allowAnonymous } from "../../middleware/auth";
import { createEndpoint } from "hono-kit";

export const POST = createEndpoint(
  {
    middleware: [allowAnonymous] as const,
    responses: { 201: {} },
  },
  async () => {
    throw new Error("fixture");
  },
);
