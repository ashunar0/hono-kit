/**
 * Failures of /statuses, only to check how they show in the client's types
 */
import { z } from "zod";

export const Taken = { code: "TAKEN", kind: "conflict", message: "Taken" } as const;
export const Starting = { code: "STARTING", kind: "conflict", message: "Starting" } as const;
export const UpstreamFailed = {
  code: "UPSTREAM_FAILED",
  kind: "upstream",
  message: "Upstream failed",
} as const;
/** A failure that is sent with the numbers behind it */
export const OverLimit = {
  code: "OVER_LIMIT",
  kind: "conflict",
  message: "Over the limit",
  details: z.object({ limit: z.number(), requested: z.number() }),
} as const;
