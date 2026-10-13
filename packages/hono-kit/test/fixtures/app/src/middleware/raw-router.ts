// expect: hnk(no-new-hono) | Do not write new Hono()
import { Hono } from "hono";

export const raw = new Hono();
