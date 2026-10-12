// expect: hnk(route-declares-auth) | .endpoint does not declare auth
import { createRouter } from "hono-kit";

export const r3Router = createRouter().endpoint(
  { method: "post", path: "/", responses: {} },
  async () => {
    throw new Error("fixture");
  },
);
