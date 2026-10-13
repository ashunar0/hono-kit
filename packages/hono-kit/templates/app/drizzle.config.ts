import { defineConfig } from "drizzle-kit";

// Tables live in each domain's outbound (repo.<tech>.ts)
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/domains/*/repo.d1.ts",
  out: "./migrations",
});
