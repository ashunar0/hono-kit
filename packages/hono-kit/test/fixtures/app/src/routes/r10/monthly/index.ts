import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";

// 例外は理由を書いて外す
// oxlint-disable-next-line hnk/route-lists-are-paged -- 件数は月の数で決まる
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
