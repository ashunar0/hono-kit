import fs from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { makeDeps } from "#/main";

// Until the first pnpm db:generate there is nothing to apply
if (fs.existsSync("./migrations/meta/_journal.json")) {
  await migrate(makeDeps().db, { migrationsFolder: "./migrations" });
}
