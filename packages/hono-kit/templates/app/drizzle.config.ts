import { defineConfig } from "drizzle-kit";

// Tables live in each module's outbound (repo.<tech>.ts)
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/domains/*/repo.d1.ts",
  out: "./migrations",
});
