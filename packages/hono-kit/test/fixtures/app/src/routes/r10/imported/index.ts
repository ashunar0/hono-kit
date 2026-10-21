// expect: hnk(route-lists-are-paged) | This list route has no limit
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";
import { importedQuery } from "../../../domains/r10/model";

// 別のファイルから来たスキーマは辿れないので止まる（query のスキーマは同じファイルに置く）
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    request: { query: importedQuery },
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
