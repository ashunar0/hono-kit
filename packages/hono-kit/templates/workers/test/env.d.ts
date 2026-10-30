declare global {
  interface Env {
    /** The migrations, passed in by vitest.config.ts */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

export {};
