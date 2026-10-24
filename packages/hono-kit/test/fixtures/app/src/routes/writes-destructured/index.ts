// expect: hnk(route-writes-once) | but loans.write.borrow writes after books.write.update
// expect: hnk(route-writes-once) | but members.write.touch writes after books.write.update
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// deps taken whole and taken apart in the body: still two services written
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, deps) => {
    const { books, loans } = deps;
    const members = deps.members;
    await books.write.update(id);
    await loans.write.borrow(id);
    await members.write.touch(id);
    throw new Error("fixture");
  },
);
