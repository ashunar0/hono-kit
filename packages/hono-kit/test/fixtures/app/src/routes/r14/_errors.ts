import { httpError } from "hono-kit";

export const InvalidSignature = httpError("INVALID_SIGNATURE", 400, "invalid signature");
