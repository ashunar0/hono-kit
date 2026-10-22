// expect: hnk(layer-imports) | A resource does not read tables
// package.json の imports（#src/）で書いても、相対と同じに役割を見る
import { createEndpoint } from "hono-kit";
import { requireAuth } from "#src/middleware/auth";
import { aTable } from "#src/domains/a/repo.d1";

export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, reply) => reply(200, { t: aTable }),
);
