/**
 * 請求書を HTTP でどう見せるか。モノのルールではなく、送るときの見せ方なので、domain ではなくリソースの側に置く
 */
import { z } from "zod";
import { invoiceStatuses } from "#src/domains/invoices/model";
import type { InvoiceRow } from "./_queries";

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

// 画面の 1 行 → 応答。書いた後も queries で読み直したものを渡す
export function invoiceResponse(invoice: InvoiceRow): InvoiceResponse {
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
