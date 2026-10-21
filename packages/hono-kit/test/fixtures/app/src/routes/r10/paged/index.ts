import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";

declare const pageQuerySchema: (filters?: unknown) => object;
declare const z: { object: (shape: object) => object };
const pagedQuery = pageQuerySchema(z.object({}));

// 上限のある一覧は通る
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    request: { query: pagedQuery },
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
