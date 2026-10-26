// expect: hnk(no-id-cast) | InvoiceId is applied with as
import type { InvoiceId } from "#src/ids/invoice";

export const forged = "x" as InvoiceId;
export const widened = "x" as string;
