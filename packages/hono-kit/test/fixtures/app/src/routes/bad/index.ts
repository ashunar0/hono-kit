// expect: hnk(layer-imports) | A resource does not import services
// expect: hnk(layer-imports) | A resource does not read tables
// expect: hnk(route-declares-auth) | .endpoint does not declare auth
import { createRouter } from "hono-kit";
import { thingService } from "../../domains/a/service";
import { aTable } from "../../domains/a/repo.d1";

export const badRouter = createRouter().endpoint(
  { method: "post", path: "/", responses: {} },
  async (_c, reply) => reply(200, { s: thingService, t: aTable }),
);
