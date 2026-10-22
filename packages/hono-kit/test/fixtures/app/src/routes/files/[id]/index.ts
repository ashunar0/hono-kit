// expect: hnk(route-writes-once) | writes after files.create
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../../middleware/auth";

// [id] の GET は 1 件なので、上限は要らない
export const GET = createEndpoint(
  { auth: requireAuth, responses: {} },
  async () => {
    throw new Error("fixture");
  },
);

export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (c, reply, { files, logs }) => {
    await files.create();
    await logs.add();
    throw new Error("fixture");
  },
);
