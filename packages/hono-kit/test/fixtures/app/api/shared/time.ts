import { z } from "zod";
import { minutesOf } from "./minutes";

export const gridMinutes = minutesOf(15);
export const calendarDateSchema = z.iso.date();
