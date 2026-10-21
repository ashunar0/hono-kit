// expect: hnk(layer-imports) | queries imports another domain's service
// expect: hnk(no-foreign-table-reads) | Reads another domain's table bTable. Use tables only inside foreign-key references()
import { s } from "../../domains/a/service";
import { bTable } from "../../domains/b/repo.d1";

export const list = (db: { select: () => { from: (t: unknown) => unknown } }) =>
  s ?? db.select().from(bTable);
