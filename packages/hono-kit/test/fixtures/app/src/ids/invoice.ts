// 型を宣言しているファイルは、作る関数の中で as を書いてよい
export type InvoiceId = string & { readonly brand: true };

export const invoiceId = (value: string) => value as InvoiceId;
