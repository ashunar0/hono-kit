import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// Reads from as many services as needed (get…, list…, queries), then one write
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { books, loans, bookQueries }) => {
    await books.get(id);
    await loans.listActive(id);
    await loans.getCopiesTaken(id);
    await loans.borrow(id);
    await bookQueries.shelf(id);
    throw new Error("fixture");
  },
);
