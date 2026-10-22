// expect: hnk(no-clock-outside-app-entry) | resource reads the clock (new Date()). The app reads it once
import { allowAnonymous } from "../../middleware/auth";
import { createEndpoint } from "hono-kit";

export const POST = createEndpoint(
  {
    auth: allowAnonymous,
    responses: {},
  },
  async () => {
    const now = new Date();
    throw new Error(`fixture ${now.toISOString()}`);
  },
);
