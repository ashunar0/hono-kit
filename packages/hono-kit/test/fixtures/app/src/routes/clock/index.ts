// expect: hnk(no-clock-outside-app-entry) | resource reads the clock (new Date()). The app reads it once
import { allowAnonymous } from "../../middleware/auth";
import { createRouter } from "hono-kit";

export const clockRouter = createRouter().endpoint(
  {
    method: "post",
    path: "/",
    middleware: [allowAnonymous] as const,
    responses: {},
  },
  async () => {
    const now = new Date();
    throw new Error(`fixture ${now.toISOString()}`);
  },
);
