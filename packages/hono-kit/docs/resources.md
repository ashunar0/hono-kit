# Adding a resource

A resource is a directory under `src/routes/`.

The generator writes no resource. Create the directory the URL says, by hand: `src/routes/invoices/index.ts` is `/invoices`, `src/routes/invoices/[id]/index.ts` is `/invoices/:id`, a child resource nests (`src/routes/customers/[customerId]/invoices/index.ts`). A directory in parentheses only groups files for reading and is left out of the URL: `src/routes/(signed-in)/invoices/index.ts` is `/invoices`. It means nothing else; each endpoint still declares its own auth. `[...path]` (catch-all) takes the rest of the path, one segment or more, slashes included: `src/routes/files/[...path]/index.ts` is `/files/:path{.+}`, and `request.param` reads it as `path` (`a/b/c.png`). It must be the last segment, and it is tried after the static and `[id]` directories beside it. Two directories that end up at the same URL stop `hnk gen`, including when they only differ in a param's name (`[id]` vs `[itemId]`, `[...path]` vs `[...rest]`). Each method is one export, `GET` / `POST` / `PUT` / `PATCH` / `DELETE`. A file with JSX is `index.tsx` instead; one directory has one of them. `pnpm hnk gen` (kept running by `pnpm dev`, and the first step of `pnpm check`) registers them in `src/routes.gen.ts`; never edit that file or register routes by hand. `pnpm install` writes it only when it is missing (`hnk gen --if-missing`), so a stale one that was committed still fails `pnpm check` on CI. `request.param` lists every `:param` of the whole path, the parent's too (`{ customerId, id }`): the generated file is underlined when one is missing. One endpoint looks like this:

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

An update is `PUT` with the whole input, the same schema as the create (`invoiceInputSchema`); use `PATCH` only when a client must change some fields and leave the rest. A change of state is not an update: it is a verb directory under the thing with only `POST` (`src/routes/invoices/[id]/send/index.ts` for `POST /invoices/:id/send`), not a `PATCH` of the status and not a noun (`/sending`). An undo is another verb (`publish` / `unpublish`).

`index.ts` exports only endpoints built with createEndpoint (`GET` / `POST` / `PUT` / `PATCH` / `DELETE`); anything else there — a helper, a re-export, a default export — is stopped by lint `route-exports-endpoints`.

What sits next to it is up to you. Starting a file that is not an endpoint with `_` makes it easy to tell apart (`_response.ts`, as in Void). `hnk gen` reads only `index.ts`, and skips directories that start with `_`.

- **Tests** go over HTTP next to the resource (`src/routes/<noun>/index.test.ts`): create, read, list, 400 on bad input, 404 for someone else's, 403 for a role that may not, 401 when signed out
- **OpenAPI**: `openapiDocument(app, info)` from `hono-kit/openapi` builds the document from the registered endpoints. Serve it from `src/index.ts` when you need one (`app.get("/openapi.json", …)`)
