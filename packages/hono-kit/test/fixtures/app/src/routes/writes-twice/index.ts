// expect: hnk(route-writes-once) | but loans.fillFreed writes after books.update
// expect: hnk(route-writes-once) | but loans.cancel writes after books.remove
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// Two writes from a user's request: the second can fail after the first is done
export const PATCH = createEndpoint(
  { middleware: [requireAuth], responses: {} },
  async (_c, _reply, { books, loans }) => {
    await books.getStock(id);
    await books.update(id);
    await loans.fillFreed(id);
    throw new Error("fixture");
  },
);

export const DELETE = createEndpoint(
  { middleware: [requireAuth], responses: {} },
  async (_c, _reply, deps) => {
    await deps.books.remove(id);
    await deps.loans.cancel(id);
    throw new Error("fixture");
  },
);
