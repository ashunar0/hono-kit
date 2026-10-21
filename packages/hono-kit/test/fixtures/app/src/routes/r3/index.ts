// expect: hnk(route-declares-auth) | The endpoint does not declare auth
import { createEndpoint } from "hono-kit";

export const POST = createEndpoint(
  { responses: {} },
  async () => {
    throw new Error("fixture");
  },
);
