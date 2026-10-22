// expect: hnk(route-responds-200) | Success is always 200
// import がファイルの最後にあっても、createEndpoint として同じに見る（route-exports-endpoints には当たらない）
export const POST = createEndpoint(
  { auth: allowAnonymous, responses: { 201: {} } },
  async () => {
    throw new Error("fixture");
  },
);

import { createEndpoint } from "hono-kit";
import { allowAnonymous } from "../../middleware/auth";
