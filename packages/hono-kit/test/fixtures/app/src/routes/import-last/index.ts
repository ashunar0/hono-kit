// expect: hnk(route-declares-auth) | The endpoint does not declare auth
// import がファイルの最後にあっても、createEndpoint として同じに見る（route-exports-endpoints には当たらない）
export const POST = createEndpoint({ responses: {} }, async () => {
  throw new Error("fixture");
});

import { createEndpoint } from "hono-kit";
