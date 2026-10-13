// expect: hnk(layer-imports) | repo imports toB from another module's repo. From another module's repo you may borrow only foreign-key tables (…Table) and scoped reads (…Within)
import { bWithin, toB } from "../b/repo.d1";

export const read = (db: unknown) => toB(bWithin(db));
