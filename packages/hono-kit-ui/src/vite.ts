/**
 * hono-kit-ui for Vite. Put it with @cloudflare/vite-plugin (or another that builds the server):
 *
 *   plugins: [honoKit(), honoKitUi(), cloudflare()]
 *
 * - Every src/**\/*.island.tsx is an island, as HonoX does with _*.island.tsx: on the server its default export is
 *   wrapped in <Island>, so a page just writes <ExpenseEditor … />. In the browser the file is left as it is.
 *   The name of an island is its path under src without .island.tsx
 * - The browser's script (client, default src/client.tsx) is built as /static/client.js, without a hash,
 *   so a layout can name it: import.meta.env.DEV ? "/src/client.tsx" : "/static/client.js"
 * - JSX is hono/jsx (Vite does not read tsconfig's jsxImportSource), and hono is one copy (dedupe)
 */
import type { Plugin } from "vite";

export const honoKitUi = ({ client = "src/client.tsx" }: { client?: string } = {}): Plugin[] => {
  let src = "";
  return [
    {
      name: "hono-kit-ui:config",
      config: () => ({
        oxc: { jsx: { importSource: "hono/jsx" } },
        resolve: { dedupe: ["hono"] },
        environments: {
          client: {
            build: {
              rollupOptions: { input: client, output: { entryFileNames: "static/client.js" } },
            },
          },
        },
      }),
    },
    {
      name: "hono-kit-ui:islands",
      configResolved(config) {
        src = `${config.root}/src/`;
      },
      transform(code, id) {
        if (!id.endsWith(".island.tsx")) return;
        // The browser runs the component itself; vitest has no environment and draws on the server
        if (this.environment?.name === "client") return;
        const found = /\nexport default ([A-Za-z_$][\w$]*);\s*$/.exec(code);
        if (!found) {
          this.error(`${id}: an island ends with "export default <Component>;"`);
        }
        // /…/app/src/components/screens/expense-editor.island.tsx → components/screens/expense-editor
        const name = id.slice(src.length).replace(/\.island\.tsx$/, "");
        return code.replace(
          found[0],
          `
import { Island as __Island } from "hono-kit-ui";
const __Wrapped = (props) => __Island({ name: ${JSON.stringify(name)}, component: ${found[1]}, props });
export default __Wrapped;
`,
        );
      },
    },
  ];
};
