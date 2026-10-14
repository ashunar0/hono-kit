// 画面のための読み取りは、範囲付きの読み（…Within）を通し、model のルールを借りてよい
import { bWithin } from "../../domains/b/repo.d1";
import { x } from "../../domains/a/model";

export const list = (db: { select: () => { from: (t: unknown) => unknown } }) =>
  db.select().from(bWithin(x));
