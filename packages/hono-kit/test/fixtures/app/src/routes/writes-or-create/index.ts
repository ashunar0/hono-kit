// expect: hnk(route-writes-once) | but loans.borrow writes after members.getOrCreate
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const id: string;

// getOrCreate starts with get but may write; getOrderById and getAndroidApps are reads
export const POST = createEndpoint(
  { middleware: [requireAuth], responses: {} },
  async (_c, _reply, { members, loans, orders }) => {
    await orders.getOrderById(id);
    await orders.getAndroidApps();
    await members.getOrCreate(id);
    await loans.borrow(id);
    throw new Error("fixture");
  },
);
