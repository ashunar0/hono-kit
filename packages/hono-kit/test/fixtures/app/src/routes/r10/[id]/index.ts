import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";

// 1 件を取る endpoint（[id] のディレクトリ）は一覧ではない
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
