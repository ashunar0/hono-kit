# When a request touches several modules

Modules do not call each other. `api/deps.ts` builds each module on its own line, with nothing wired between them. The joining happens at the entry point: the handler of a resource (`api/routes/<noun>/index.ts`), a webhook, a queue consumer or a cron job.

A complete example (a customer's invoices, billed from products):

```ts
// api/routes/customers/invoices/index.ts: read from as many modules as needed, write once
async (c, reply, { customers, products, invoices }) => {
  const actor = c.get("actor");
  const { customerId } = c.req.valid("param");
  const input = c.req.valid("json");
  const now = new Date();

  // Entry check: the customer in the URL exists (404 here, not in a service)
  const customer = await customers.get(actor, customerId);
  if (!customer.ok) return reply.failure(customer.error);

  // Materials for the decision. Not filtered by organization: the writing service checks that
  const items = await products.pick(input.productIds.map(productId));

  // One write, through the one service that owns the rule
  const result = await invoices.create(
    actor,
    { customer: customer.value, items },
    input,
    now,
  );
  if (!result.ok) return reply.failure(result.error);

  return reply(200, invoiceResponse(result.value));
};

// modules/invoices/service.ts: declare the shape you take, not another module's types
export type Billed = {
  customer: { id: string; organizationId: string };
  items: { id: string; organizationId: string; price: number }[];
};
```

## Reading

- A handler may take as many services from deps as it needs (`{ customers, products, invoices }`). It never imports a service or repo
- A thing named in the URL that does not exist is a 404 returned in the handler, before calling the writing service. Write it out in each handler; do not hide it in middleware
- If the other thing is not visible to the actor, treat it as absent: `NOT_FOUND`

## Writing from a user's request (HTTP)

There are no retries, so **one call to one service**. Two writes in a row leave the first done when the second fails.

- The handler passes what it read as values. The writing service **checks that they belong together** before deciding, because rules that must hold from every entry point live in the service:
  - Values the client chose (product ids in the body) that do not match → a domain failure (`PRODUCT_NOT_FOUND`)
  - Values the handler read from the DB that do not match (`member.storeId !== store.id`) → a bug: `throw`
- Ask "is this check needed when cron calls it too?" If not (404 for an ID in the URL), it goes in the handler. If so (permission, a rule across things), it stays in the service
- Writes that must happen together go inside that one call, in one batch (the repo receives `batch`)

### When the write must cause something in another module

Do not write the other module's table, and do not make a second write from the handler. **Record it in your own table in the same batch** (an outbox: `reservation_events`, `invoice_notifications`, ...), and deliver it later from an entry point that retries (your module's `cron.ts` or `queue.ts`). The delivery is then a write from a retrying entry point (next section).

## Writing from an entry point that retries (webhook, queue, cron)

A failure midway is retried, so the entry point **may write to several modules one after another**, as long as every write gives **the same result however many times it runs**:

- Use a unique key (`insertIfAbsent`), or a transition that only moves from the expected state (`transitionWithin(id, reach, from, changes)`)
- Write the thing that marks the work done (the outbox row, the webhook event) **last**
- Each write is still one call to one service; the entry point calls them in order

```ts
// modules/payments/webhook.stripe.ts (sketch): the payment is recorded, then the invoice is marked paid
const recorded = await payments.record(actor, event, now); // unique by event id
if (!recorded.ok) return reply.failure(recorded.error);
await invoices.markPaid(actor, recorded.value.invoiceId, now); // only from "sent"; a retry finds it paid and does nothing
```

## IDs and values from other modules

- **In routes**: use the owner module's `…IdSchema` for params and bodies (`customerIdSchema` from `modules/customers/domain`). Routes may import any module's domain values
- **Inside a module** (`domain` / `service`): another module's ID is a plain `string` (`Invoice.customerId`). Only **types** may be borrowed from another module (`import type`; `hnk/layer-imports` enforces it). For enum values shared with another module (`roles`, ...), keep **your own copy** and make types check that the values match
- **Values that belong to no domain** (calendar dates, times of day, time-zone conversion, the app's time grid) go in `api/shared/` and may be imported as values from anywhere. The test is "does it have an owner?": a staff role belongs to staff (copy it or borrow its type), a calendar day belongs to nobody (shared). `api/shared/` imports only zod and other shared files, so modules can never reach each other through it
- Another module's table: only inside foreign-key `references()`

## Reach is the same for reads and writes

`within(reach)` is used in the WHERE of reads and of `updateWithin` / `deleteWithin`. Multiple conditions like "creator or assignee" can be written with `or(...)`, but the same condition also means **once you unassign yourself, you can no longer see it, and can no longer write it**.

## Things that hang under a parent (comments, ...)

- The resource nests under the parent's: `api/routes/issues/comments/index.ts`, mounted by the parent with `.route("/:issueId/comments", issueCommentsRouter)`. The child's paths are the rest only (`"/"`, `"/:id"`), and `request.param` lists the parent's param too (`{ issueId, id }`)
- The handler asks the parent's service whether the parent is visible (`issues.get(actor, issueId)`). If not, `NOT_FOUND`, returned in the handler
- The child repo filters by **parent ID**, not by reach. Name its methods `listOf(parentId)` / `findOf(parentId, id)` instead of `listWithin` / `findWithin`
- The parent ID is a plain `string` inside the child module. Permission checks ("the author or an admin") are pure domain functions
- `pnpm hnk g module comments` writes only the module. Write the resource in `api/routes/issues/comments/` and mount it from the parent
