import { allowSystem, createEndpoint } from "hono-kit";

declare const id: string;

// An entry point that retries (a webhook) may write to several domains in order
export const POST = createEndpoint(
  { middleware: [allowSystem], responses: {} },
  async (_c, _reply, { payments, invoices }) => {
    await payments.receive(id);
    await invoices.markPaid(id);
    throw new Error("fixture");
  },
);
