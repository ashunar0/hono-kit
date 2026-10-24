// expect: hnk(route-writes-once) | Taken out (`const { write } = invoices`
// expect: hnk(route-writes-once) | Taken out (`const { write } = invoices`
// expect: hnk(route-writes-once) | Taken out (`const { write } = invoices`
// expect: hnk(route-writes-once) | Taken out (`const { write } = invoices`
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const ids: string[];

// A write taken out of its service is called somewhere the rule cannot count
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { books, loans }) => {
    const { write } = books;
    const w = loans.write;
    await write.update(ids[0]);
    await w.borrow(ids[0]);
    await Promise.all(ids.map(books.write.update));
    throw new Error("fixture");
  },
);

export const PUT = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { members: { write } }) => {
    await write.touch(ids[0]);
    throw new Error("fixture");
  },
);
