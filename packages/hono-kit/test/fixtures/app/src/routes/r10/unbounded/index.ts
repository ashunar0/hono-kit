// expect: hnk(route-lists-are-paged) | This list route has no limit
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";

// 上限が無い一覧は止まる
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
