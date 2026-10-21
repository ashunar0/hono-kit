import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";

declare const pageQuerySchema: (filters?: unknown) => object;
declare const z: { object: (shape: object) => object };

// その場で包んでも通る
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    request: { query: pageQuerySchema() },
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
