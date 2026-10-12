import type { InferInsertModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

/** The only place in this project that names the database driver */
export const wireDb = (binding: D1Database) => drizzle(binding);

export type Db = ReturnType<typeof wireDb>;

/** A read-only db. It can read other modules' tables too (for joins) */
export type ReadDb = Pick<Db, "select">;

/**
 * Takes out only what this module may touch.
 *
 * Reads may cross modules, writes are limited to this table: the asymmetry in the convention becomes the type.
 * The repository never gets db, so writing to another module's table cannot be written
 */
export const scopeTo = <T extends SQLiteTable>(db: Db, table: T) => ({
  reads: db as ReadDb,
  insert: (values: InferInsertModel<T>) => db.insert(table).values(values),
  update: (values: Partial<InferInsertModel<T>>) => db.update(table).set(values),
  delete: () => db.delete(table),
});

export type Scope<T extends SQLiteTable> = ReturnType<typeof scopeTo<T>>;
