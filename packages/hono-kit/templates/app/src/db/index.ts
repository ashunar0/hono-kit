import { drizzle } from "drizzle-orm/d1";

/** The only place in this project that names the database driver */
export const wireDb = (binding: D1Database) => drizzle(binding);

export type Db = ReturnType<typeof wireDb>;
