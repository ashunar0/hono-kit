/**
 * /greetings: one greeting in JSON, HTML and Markdown, chosen by Accept. Written in index.tsx for the JSX
 */
import { createEndpoint } from "hono-kit";
import { z } from "zod";
import { allowAnonymous } from "#src/middleware/auth";

const greeting = z.object({ name: z.string() });
type Greeting = z.infer<typeof greeting>;

const GreetingPage = ({ name }: Greeting) => <p>Hello, {name}</p>;

export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    responses: {
      200: {
        "application/json": greeting,
        "text/html": (data: Greeting) => <GreetingPage {...data} />,
        "text/markdown": (data: Greeting) => `# Hello, ${data.name}`,
      },
    },
  },
  async (_c, reply) => reply.success({ name: "hono" }),
);
