import { calendarDateSchema } from "../../shared/time";

export const parseDate = (value: string) => calendarDateSchema.parse(value);
