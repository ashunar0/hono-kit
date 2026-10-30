import { drizzle } from "drizzle-orm/libsql";

/** The only place in this project that names the database driver. url is "file:data.db", or ":memory:" in tests */
export const wireDb = (url: string) => drizzle({ connection: { url } });

export type Db = ReturnType<typeof wireDb>;
