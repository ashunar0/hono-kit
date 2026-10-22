// expect: hnk(route-writes-once) | but loans.borrow writes after books.update
// expect: hnk(route-writes-once) | but members.touch writes after books.update
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// deps taken whole and taken apart in the body: still two services written
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, deps) => {
    const { books, loans } = deps;
    const members = deps.members;
    await books.update(id);
    await loans.borrow(id);
    await members.touch(id);
    throw new Error("fixture");
  },
);
