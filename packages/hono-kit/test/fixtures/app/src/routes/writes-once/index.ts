import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// Reads from as many readers and queries as needed, whatever the method is named, then one write
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { booksReader, loansReader, loans, bookQueries }) => {
    await booksReader.get(id);
    await loansReader.findActive(id);
    await loansReader.countCopiesTaken(id);
    await loans.borrow(id);
    await bookQueries.shelf(id);
    throw new Error("fixture");
  },
);
