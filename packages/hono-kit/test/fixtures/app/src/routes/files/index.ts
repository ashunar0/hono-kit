// expect: hnk(route-responds-200) | Success is always 200
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const pageQuerySchema: (filters?: unknown) => object;
declare const z: { object: (shape: object) => object };

export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { query: z.object({}) },
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);

// 200 以外の成功は止める
export const PUT = createEndpoint(
  {
    auth: requireAuth,
    request: { query: pageQuerySchema(z.object({})) },
    responses: { 201: {} },
  },
  async () => {
    throw new Error("fixture");
  },
);
