# Adding a resource

Read [layout.md](layout.md) first. A resource is a directory under `src/routes/`; the reads it uses are in [layout.md](layout.md#reads-and-writes).

The generator writes no resource. Create the directory the URL says, by hand: `src/routes/invoices/index.ts` is `/invoices`, `src/routes/invoices/[id]/index.ts` is `/invoices/:id`, a child resource nests (`src/routes/customers/[customerId]/invoices/index.ts`). A directory in parentheses only groups files for reading and is left out of the URL: `src/routes/(signed-in)/invoices/index.ts` is `/invoices`. It means nothing else; each endpoint still declares its own auth. `[...path]` (catch-all) takes the rest of the path, one segment or more, slashes included: `src/routes/files/[...path]/index.ts` is `/files/:path{.+}`, and `request.param` reads it as `path` (`a/b/c.png`). It must be the last segment, and it is tried after the static and `[id]` directories beside it. Two directories that end up at the same URL stop `hnk gen`. Each method is one export, `GET` / `POST` / `PUT` / `PATCH` / `DELETE`. `pnpm hnk gen` (kept running by `pnpm dev`, and the first step of `pnpm check`) registers them in `src/routes.gen.ts`; never edit that file or register routes by hand. `pnpm install` writes it only when it is missing (`hnk gen --if-missing`), so a stale one that was committed still fails `pnpm check` on CI. `request.param` lists every `:param` of the whole path, the parent's too (`{ customerId, id }`): the generated file is underlined when one is missing. One endpoint looks like this:

```ts
// src/routes/invoices/[id]/index.ts
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { param: z.object({ id: invoiceIdSchema }) },
    responses: { 200: invoiceResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply, { invoicesQueries }) => {
    const actor = c.get("actor");
    const { id } = c.req.valid("param");

    const invoice = await invoicesQueries.get(actor, id);
    if (invoice === null) return reply.failure(NotFound.code);

    return reply(200, invoiceResponse(invoice));
  },
);
```

An update is `PUT` with the whole input, the same schema as the create (`invoiceInputSchema`); use `PATCH` only when a client must change some fields and leave the rest. A change of state is not an update: it is a verb (state.md).

`index.ts` exports only method constants built with createEndpoint (`GET` / `POST` / `PUT` / `PATCH` / `DELETE`); anything else there — a helper, a re-export, a default export — is stopped by lint `route-exports-endpoints`.

`index.ts` holds the endpoints. Everything else next to it starts with `_`:

| File           | Role                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| `index.ts`     | The endpoints at this path: `export const GET = createEndpoint(...)`, ...       |
| `_response.ts` | How the thing is shown over HTTP: `…ResponseSchema` and `…Response`             |
| `_errors.ts`   | Failures only this entry point has (a webhook signature, ...). Only when needed |
| `_queries.ts`  | The reads of the GET endpoints (see [layout.md](layout.md#reads-and-writes))    |

- **`_response.ts`**: a response is how a thing is shown when sent, not a rule of the thing, so it belongs to the resource. It takes the row type of queries (`InvoiceRow`), not the domain thing. A resource that shows a thing has one, even if only `index.ts` uses it; `invoices/[id]/` imports `../_response`. Another resource showing the same thing imports it. Small one-off shapes (`{ ok: true }`) stay in `index.ts`
- **IDs** in params and bodies use the owner domain's `…IdSchema` (`customerIdSchema` from `domains/customers/model`)
- **Tests** go over HTTP next to the resource (`src/routes/<noun>/index.test.ts`): create, read, list, 400 on bad input, 404 for someone else's, 403 for a role that may not, 401 when signed out
- **OpenAPI**: `openapiDocument(app, info)` from `hono-kit/openapi` builds the document from the registered endpoints. Serve it from `src/index.ts` when you need one (`app.get("/openapi.json", …)`)
