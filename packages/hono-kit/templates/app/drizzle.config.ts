import { defineConfig } from "drizzle-kit";

// Tables live in each module's outbound (repo.<tech>.ts)
export default defineConfig({
  dialect: "sqlite",
  schema: "./api/modules/*/repo.d1.ts",
  out: "./migrations",
});
