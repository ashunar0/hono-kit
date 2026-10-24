// expect: hnk(route-writes-once) | but books.write.update runs once per item of a loop
// expect: hnk(route-writes-once) | but loans.write.borrow runs once per item of a loop
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const ids: string[];

// One write in the text, but one per item: if one fails, the ones before it stay done
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { books, loans }) => {
    for (const id of await books.read.ids()) await books.write.update(id);
    await Promise.all(ids.map((id) => loans.write.borrow(id)));
    throw new Error("fixture");
  },
);
