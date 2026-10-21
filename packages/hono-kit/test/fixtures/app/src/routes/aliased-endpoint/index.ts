// expect: hnk(route-declares-auth) | The endpoint does not declare auth
// createEndpoint を別名で import しても、endpoint として同じに見る
import { createEndpoint as ep } from "hono-kit";

export const POST = ep({ responses: {} }, async () => {
  throw new Error("fixture");
});
