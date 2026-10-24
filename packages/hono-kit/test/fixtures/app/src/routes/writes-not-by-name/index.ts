// expect: hnk(route-writes-once) | but loans.write.borrow writes after members.write.getOrCreate
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// Where a call lives decides, not its name: a read may be named anything, and a write named get… is still a write
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { members, loans, orders }) => {
    await orders.read.findById(id);
    await orders.read.countOpen();
    await members.write.getOrCreate(id);
    await loans.write.borrow(id);
    throw new Error("fixture");
  },
);
