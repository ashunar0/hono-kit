# AGENTS.md

This is a backend built on [hono-kit](https://github.com/ashunar0/hono-kit): Hono + Cloudflare Workers + D1 + Drizzle + Standard Schema (zod).
The rules ship with the installed hono-kit. **Before writing any file, read `node_modules/hono-kit/docs/index.md`**, then the page for what you are doing.

## Commands

```sh
pnpm hnk g domain <plural camelCase>   # add a domain, e.g. invoices, signupRequests
pnpm db:generate                       # after changing a table; writes migrations/ (tests read them)
pnpm exec prettier --write .           # once after editing, before check
pnpm check                             # typecheck, lint, format check, tests
```

**Do not stop until `pnpm check` prints `All checks passed`.** Every lint message says how to fix it. Do not silence lint (the only exception is `route-lists-are-paged`, with a reason).
