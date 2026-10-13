// expect: hnk(no-id-cast) | InvoiceId is applied with as
type InvoiceId = string & { readonly brand: true };

export const forged = "x" as InvoiceId;
export const widened = "x" as string;
