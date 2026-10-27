# Adding a resource

A resource is a directory under `src/routes/`.

The generator writes no resource. Create the directory the URL says, by hand: `src/routes/invoices/index.ts` is `/invoices`, `src/routes/invoices/[id]/index.ts` is `/invoices/:id`, a child resource nests (`src/routes/customers/[customerId]/invoices/index.ts`). A directory in parentheses only groups files for reading and is left out of the URL: `src/routes/(signed-in)/invoices/index.ts` is `/invoices`. It means nothing else; each endpoint still declares its own auth. `[...path]` (catch-all) takes the rest of the path, one segment or more, slashes included: `src/routes/files/[...path]/index.ts` is `/files/:path{.+}`, and `request.param` reads it as `path` (`a/b/c.png`). It must be the last segment, and it is tried after the static and `[id]` directories beside it. Two directories that end up at the same URL stop `hnk prepare`, including when they only differ in a param's name (`[id]` vs `[itemId]`, `[...path]` vs `[...rest]`). Each method is one export, `GET` / `POST` / `PUT` / `PATCH` / `DELETE`. A file with JSX is `index.tsx` instead; one directory has one of them. `pnpm hnk prepare` registers them in `src/routes.gen.ts`; never edit that file or register routes by hand. It is not committed (it is in `.gitignore`): `pnpm install`, `pnpm dev` (which keeps it running) and `pnpm check` (its first step) write it. `request.param` lists every `:param` of the whole path, the parent's too (`{ customerId, id }`): the generated file is underlined when one is missing. One endpoint looks like this:

```ts
// src/routes/invoices/[id]/index.ts
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: invoiceResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply, { db }) => {
    const { id } = c.req.valid("param");

    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id))
      .limit(1);
    if (invoice === undefined) return reply.failure(NotFound.code);

    return reply.success(invoiceResponse(invoice));
  },
);
```

To send the same data as HTML (or Markdown) to whoever asks for it, list the formats under 200 instead of one schema, in `index.tsx`. Put `application/json` first: it is sent when the client accepts anything (`hc`, `fetch`, `curl`). The handler does not change; which one is sent is chosen from `Accept`, a client that accepts none gets 406 before the handler runs, and the response carries `Vary: Accept`. Annotate each renderer's parameter; it must take what the JSON schema returns:

```tsx
200: {
  "application/json": invoiceResponseSchema,
  "text/html": (invoice: InvoiceResponse) => <InvoicePage invoice={invoice} />,
  "text/markdown": (invoice: InvoiceResponse) => `# Invoice ${invoice.id}`,
},
```

A page that fails shows JSON (`{ error }`) unless the app has an error page. Register one in `src/index.ts`, before `authenticate`: `app.use("*", errorPage((failure) => failure.status === 401 ? { redirect: "/login" } : ErrorPage(failure)))`. `failure` is `{ code, status, message }`. It is used only when the client asked for HTML and the endpoint returns HTML, for declared failures, the ones thrown before the handler (401, 400, 406) and unexpected errors (500); the handler does not change.

An update is `PUT` with the whole input, the same schema as the create (`invoiceInputSchema`); use `PATCH` only when a client must change some fields and leave the rest. A change of state is not an update: it is a verb directory under the thing with only `POST` (`src/routes/invoices/[id]/send/index.ts` for `POST /invoices/:id/send`), not a `PATCH` of the status and not a noun (`/sending`). An undo is another verb (`publish` / `unpublish`).

`index.ts` exports only endpoints built with createEndpoint (`GET` / `POST` / `PUT` / `PATCH` / `DELETE`); anything else there — a helper, a re-export, a default export — is stopped by lint `route-exports-endpoints`.

What sits next to it is up to you. Starting a file that is not an endpoint with `_` makes it easy to tell apart (`_response.ts`, as in Void). `hnk prepare` reads only `index.ts` (or `index.tsx`), and skips directories that start with `_`.

- **Tests** go over HTTP next to the resource (`src/routes/<noun>/index.test.ts`): create, read, list, 400 on bad input, 404 for someone else's, 403 for a role that may not, 401 when signed out
- **OpenAPI**: `openapiDocument(app, info)` from `hono-kit/openapi` builds the document from the registered endpoints. Serve it from `src/index.ts` when you need one (`app.get("/openapi.json", …)`)
