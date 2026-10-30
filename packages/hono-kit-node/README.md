# hono-kit-node

Runs a [hono-kit](https://github.com/ashunar0/hono-kit) app's crons on Node. The `node` template (`pnpm create hnk my-app --template node`) already uses it.

```ts
// src/server.ts
import { startCrons } from "hono-kit-node";
import { crons } from "./routes.gen";

const stopCrons = startCrons(crons, { makeDeps });
// on shutdown: stopCrons()
```

Schedules are read in UTC, as on Cloudflare Workers.
