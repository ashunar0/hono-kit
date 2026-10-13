// expect: hnk(layer-imports) | repo imports toB from another domain's repo. From another domain's repo you may borrow only foreign-key tables (…Table) and scoped reads (…Within)
import { bWithin, toB } from "../b/repo.d1";

export const read = (db: unknown) => toB(bWithin(db));
