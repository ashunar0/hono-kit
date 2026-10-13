import { getTableColumns, type InferInsertModel } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import type {
  QueryBuilder,
  SQLiteInsertSelectQueryBuilder,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";

/** The only place in this project that names the database driver */
export const wireDb = (binding: D1Database) => drizzle(binding);

export type Db = ReturnType<typeof wireDb>;

/**
 * Runs the statements built by scopes as one all-or-nothing batch (D1 rolls the whole batch back if one fails).
 * It takes statements, not a db, so what can go in is only what a scope could build: writes to the domain's own tables.
 * The results come back one per statement, in order
 */
export const wireBatch =
  (db: Db) =>
  <U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(statements: T) =>
    db.batch(statements);

export type Batch = ReturnType<typeof wireBatch>;

/** A read-only db. It can read other domains' tables too (for joins) */
export type ReadDb = Pick<Db, "select">;

/** D1 allows this many bound values (`?`) in one statement */
const maxBoundValues = 100;

/**
 * Takes out only what this domain may touch.
 *
 * Reads may cross domains, writes are limited to this table: the asymmetry in the convention becomes the type.
 * The repository never gets db, so writing to another domain's table cannot be written
 */
export const scopeTo = <T extends SQLiteTable>(db: Db, table: T) => ({
  reads: db as ReadDb,
  insert: (values: InferInsertModel<T>) => db.insert(table).values(values),
  /**
   * Inserts many rows, as as many statements as D1 needs (it allows 100 bound values in a statement).
   * Put them into a batch with the rest; no rows gives no statements
   */
  insertMany: (rows: InferInsertModel<T>[]) => {
    const rowsPerStatement = Math.floor(
      maxBoundValues / Object.keys(getTableColumns(table)).length,
    );
    const statements = [];
    for (let i = 0; i < rows.length; i += rowsPerStatement) {
      statements.push(db.insert(table).values(rows.slice(i, i + rowsPerStatement)));
    }
    return statements;
  },
  /** Inserts the rows a query selects (it may read any table). Gives "insert only if" inside a batch */
  insertFrom: (query: (qb: QueryBuilder) => SQLiteInsertSelectQueryBuilder<T>) =>
    db.insert(table).select(query),
  update: (values: Partial<InferInsertModel<T>>) => db.update(table).set(values),
  delete: () => db.delete(table),
});

export type Scope<T extends SQLiteTable> = ReturnType<typeof scopeTo<T>>;
