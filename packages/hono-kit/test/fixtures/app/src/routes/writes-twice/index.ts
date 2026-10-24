// expect: hnk(route-writes-once) | but loans.write.fillFreed writes after books.write.update
// expect: hnk(route-writes-once) | but loans.write.cancel writes after books.write.remove
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// Two writes from a user's request: the second can fail after the first is done
export const PATCH = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { books, loans }) => {
    await books.read.stock(id);
    await books.write.update(id);
    await loans.write.fillFreed(id);
    throw new Error("fixture");
  },
);

export const DELETE = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, deps) => {
    await deps.books.write.remove(id);
    await deps.loans.write.cancel(id);
    throw new Error("fixture");
  },
);
