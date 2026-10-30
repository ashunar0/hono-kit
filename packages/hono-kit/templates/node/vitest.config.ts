import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file gets its own empty database, with the same migrations as production
    env: { DATABASE_URL: ":memory:" },
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
