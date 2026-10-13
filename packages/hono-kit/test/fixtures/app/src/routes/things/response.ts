import { z } from "zod";
import type { Thing } from "../../domains/a/model";

export const thingResponseSchema = z.object({ id: z.string() });

export const thingResponse = (thing: Thing) => ({ id: thing.id });
