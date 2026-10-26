/**
 * Failures of /statuses, only to check how they show in the client's types
 */
export const Taken = { code: "TAKEN", kind: "conflict", message: "Taken" } as const;
export const Starting = { code: "STARTING", kind: "conflict", message: "Starting" } as const;
export const UpstreamFailed = {
  code: "UPSTREAM_FAILED",
  kind: "upstream",
  message: "Upstream failed",
} as const;
