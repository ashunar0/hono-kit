/**
 * 共有の応答の形。共有と、共有をやめる（[userId]/）の両方が返す
 */
import { z } from "zod";

export const okResponseSchema = z.object({ ok: z.literal(true) });
