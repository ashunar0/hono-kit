// expect: hnk(no-foreign-table-reads) | Reads another module's table bTable. Use tables only inside foreign-key references()
import { bTable } from "../b/repo.d1";

export const bad = (db: { select: () => { from: (t: unknown) => unknown } }) =>
  db.select().from(bTable);
