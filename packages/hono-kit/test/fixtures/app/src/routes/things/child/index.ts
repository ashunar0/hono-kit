import { createRouter } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";
import { thingResponse } from "../response";

export const childRouter = createRouter().endpoint(
  { method: "post", path: "/", middleware: [requireAuth] as const, responses: {} },
  async (_c, reply) => reply(200, thingResponse({ id: "x" })),
);
