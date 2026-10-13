/**
 * 請求書を HTTP でどう見せるか。モノのルールではなく、送るときの見せ方なので、module ではなくリソースの側に置く
 */
import { z } from "zod";
import { invoiceStatuses, type Invoice } from "../../domains/invoices/domain";

export const invoiceResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  amount: z.number(),
  customerEmail: z.string(),
  dueAt: z.number(),
  status: z.enum(invoiceStatuses),
  createdAt: z.number(),
  updatedAt: z.number(),
});

type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;

// モノ → 応答。モノをそのまま返さず、見せる形に詰め替える
export function invoiceResponse(invoice: Invoice): InvoiceResponse {
  return {
    id: invoice.id,
    title: invoice.title,
    body: invoice.body,
    amount: invoice.amount,
    customerEmail: invoice.customerEmail,
    dueAt: invoice.dueAt.getTime(),
    status: invoice.status,
    createdAt: invoice.createdAt.getTime(),
    updatedAt: invoice.updatedAt.getTime(),
  };
}
