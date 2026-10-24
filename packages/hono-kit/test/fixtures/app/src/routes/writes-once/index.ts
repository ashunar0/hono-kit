import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// Reads from as many services as needed (.read. and queries, whatever their names), then one write
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { books, loans, bookQueries }) => {
    await books.read.get(id);
    await loans.read.findActive(id);
    await loans.read.copiesTaken(id);
    await loans.write.borrow(id);
    await bookQueries.shelf(id);
    throw new Error("fixture");
  },
);
