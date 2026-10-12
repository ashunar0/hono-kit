import { createRouter } from "hono-kit";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { thing } from "../../modules/a/domain";
import { childRouter } from "./child";
import { thingResponse } from "./response";

const params = z.object({ id: z.string() });

export const thingsRouter = createRouter()
  .endpoint(
    {
      method: "get",
      path: "/:id",
      middleware: [requireAuth] as const,
      request: { param: params },
      responses: {},
    },
    async (_c, reply, { a }) => reply(200, thingResponse(await a.get(thing))),
  )
  .route("/:id/child", childRouter);
