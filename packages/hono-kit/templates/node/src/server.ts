import { serve } from "@hono/node-server";
import { startCrons } from "hono-kit-node";
import { buildApp, makeDeps } from "./main";
import { crons } from "./routes.gen";

/** Starts the server (pnpm dev, pnpm start). Kept apart from main.ts so tests can import the app without starting it */
const server = serve({ fetch: buildApp().fetch, port: Number(process.env.PORT ?? 3000) }, (info) =>
  console.log(`Listening on http://localhost:${info.port}`),
);

// The crons in src/crons, on their schedules (UTC)
const stopCrons = startCrons(crons, { makeDeps });

// Stop the crons, finish the requests in flight, then close the database
const shutdown = () => {
  stopCrons();
  server.close(() => {
    makeDeps().db.$client.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
