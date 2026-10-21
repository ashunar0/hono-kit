// expect: hnk(route-writes-once) | but books.update runs once per item of a loop
// expect: hnk(route-writes-once) | but loans.borrow runs once per item of a loop
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const ids: string[];

// One write in the text, but one per item: if one fails, the ones before it stay done
export const POST = createEndpoint(
  { middleware: [requireAuth], responses: {} },
  async (_c, _reply, { books, loans }) => {
    for (const id of await books.listIds()) await books.update(id);
    await Promise.all(ids.map((id) => loans.borrow(id)));
    throw new Error("fixture");
  },
);
