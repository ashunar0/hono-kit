import { createRouter } from "hono-kit";
import { requireAuth } from "../../middleware/auth";
import { InvalidSignature } from "./_errors";

export const r14Router = createRouter().endpoint(
  {
    method: "post",
    path: "/",
    middleware: [requireAuth] as const,
    responses: {},
  },
  async () => {
    throw InvalidSignature;
  },
);
