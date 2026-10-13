import { createRouter } from "hono-kit";
import { requireRole } from "../../middleware/auth";

// A guard built by a call counts as the one auth guard
export const roleRouter = createRouter().endpoint(
  {
    method: "post",
    path: "/",
    middleware: [requireRole("admin")] as const,
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
