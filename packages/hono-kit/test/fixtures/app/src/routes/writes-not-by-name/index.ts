// expect: hnk(route-writes-once) | but loans.borrow writes after members.get
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// Where it is called decides, not the name: a service only writes, even a method named get, and a reader only reads
export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, _reply, { members, membersReader, loans }) => {
    await membersReader.findOrNull(id);
    await members.get(id);
    await loans.borrow(id);
    throw new Error("fixture");
  },
);
