import { serve } from "@hono/node-server";
import { buildApp, makeDeps } from "./main";

/** Starts the server (pnpm dev, pnpm start). Kept apart from main.ts so tests can import the app without starting it */
const server = serve({ fetch: buildApp().fetch, port: Number(process.env.PORT ?? 3000) }, (info) =>
  console.log(`Listening on http://localhost:${info.port}`),
);

// Finish the requests in flight, then close the database
const shutdown = () =>
  server.close(() => {
    makeDeps().db.$client.close();
    process.exit(0);
  });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
