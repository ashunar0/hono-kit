// expect: hnk(layer-imports) | A resource does not import services
// expect: hnk(layer-imports) | A resource does not read tables
// expect: hnk(route-declares-auth) | The endpoint does not declare auth
import { createEndpoint } from "hono-kit";
import { thingService } from "../../domains/a/service";
import { aTable } from "../../domains/a/repo.d1";

export const POST = createEndpoint(
  { responses: {} },
  async (_c, reply) => reply(200, { s: thingService, t: aTable }),
);
