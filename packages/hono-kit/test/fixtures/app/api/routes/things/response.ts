import { z } from "zod";
import type { Thing } from "../../modules/a/domain";

export const thingResponseSchema = z.object({ id: z.string() });

export const thingResponse = (thing: Thing) => ({ id: thing.id });
