// expect: hnk(route-responds-200) | Success is always 200
import { allowAnonymous } from "../../middleware/auth";
import { createRouter } from "hono-kit";

export const createdRouter = createRouter().endpoint(
  {
    method: "post",
    path: "/",
    middleware: [allowAnonymous] as const,
    responses: { 201: {} },
  },
  async () => {
    throw new Error("fixture");
  },
);
