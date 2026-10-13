import type { CronContext } from "hono-kit";
import { thing } from "../domains/a/model";

export const run = (ctx: CronContext) => [ctx, thing];
