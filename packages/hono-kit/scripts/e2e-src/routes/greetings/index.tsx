/**
 * /greetings: an endpoint written in index.tsx, to check that gen, types and lint read .tsx
 */
import { createEndpoint } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "#src/middleware/auth";

const Greeting = ({ name }: { name: string }) => <p>Hello, {name}</p>;

export const GET = createEndpoint(
  { auth: allowAnonymous, responses: { 200: z.object({ html: z.string() }) } },
  async (_c, reply) => reply.success({ html: String(<Greeting name="hono" />) }),
);
