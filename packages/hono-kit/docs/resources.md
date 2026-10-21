# Adding a resource

Read [layout.md](layout.md) first. A resource is a directory under `src/routes/`; the reads it uses are in [layout.md](layout.md#reads-and-writes).

The generator writes no resource. Create the directory the URL says, by hand: `src/routes/invoices/index.ts` is `/invoices`, `src/routes/invoices/[id]/index.ts` is `/invoices/:id`, a child resource nests (`src/routes/customers/[customerId]/invoices/index.ts`). Each method is one export, `GET` / `POST` / `PUT` / `PATCH` / `DELETE`. `pnpm hnk gen` (the first step of `pnpm check`) registers them in `src/routes.gen.ts`; never edit that file or register routes by hand. `request.param` lists every `:param` of the whole path, the parent's too (`{ customerId, id }`): the generated file is underlined when one is missing. One endpoint looks like this:

```ts
// src/routes/invoices/[id]/index.ts
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
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
