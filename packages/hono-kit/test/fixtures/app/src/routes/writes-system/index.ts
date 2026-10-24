import { allowSystem, createEndpoint } from "hono-kit";

declare const id: string;

// An entry point that retries (a webhook) may write to several domains in order
export const POST = createEndpoint(
  { auth: allowSystem, responses: {} },
  async (_c, _reply, { payments, invoices }) => {
    await payments.write.receive(id);
    await invoices.write.markPaid(id);
    throw new Error("fixture");
  },
);
