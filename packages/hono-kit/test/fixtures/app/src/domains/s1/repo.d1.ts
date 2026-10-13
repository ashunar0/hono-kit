import { calendarDateSchema } from "../../lib/time";

export const parseDate = (value: string) => calendarDateSchema.parse(value);
