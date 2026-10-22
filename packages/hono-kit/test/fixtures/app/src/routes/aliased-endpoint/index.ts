// expect: hnk(route-responds-200) | Success is always 200
// createEndpoint を別名で import しても、endpoint として同じに見る
import { createEndpoint as ep } from "hono-kit";
import { allowAnonymous } from "../../middleware/auth";

export const POST = ep(
  { auth: allowAnonymous, responses: { 201: {} } },
  async () => {
    throw new Error("fixture");
  },
);
