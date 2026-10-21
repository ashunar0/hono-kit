// expect: hnk(route-lists-are-paged) | This list route has no limit
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";

declare const z: { object: (shape: object) => object };
// 名前が似ているだけで、包んでいない
const notPageQuerySchema = z.object({ limit: 1 });

// 名前やコメントに pageQuerySchema とあっても、包んでいなければ止まる
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    request: { query: notPageQuerySchema },
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
