# When a request touches several domains

Domains do not call each other. `src/deps.ts` builds each domain on its own line, with nothing wired between them. The joining happens at the entry point: the handler of a resource (`src/routes/<noun>/index.ts`), a webhook, a queue consumer or a cron job.

A complete example (a customer's invoices, billed from products):

```ts
// src/routes/customers/invoices/index.ts: read from as many domains as needed, write once
async (c, reply, { customers, products, invoices }) => {
  const actor = c.get("actor");
  const { customerId } = c.req.valid("param");
  const input = c.req.valid("json");
  const now = c.get("now");

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

// domains/invoices/service.ts: declare the shape you take, not another domain's types
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
- Ask "is this check needed when cron calls it too?" If not (404 for an ID in the URL), it goes in the handler. If so (a permission that needs the row, a rule across things), it stays in the service. A permission the role alone decides is the endpoint guard (`requireRole`)
- Writes that must happen together go inside that one call, in one batch (the repo receives `batch`: `wireBatch(db)`, next to its scopes). One repo call writes all or nothing; how is the store's business (D1 sends a fixed batch, a store with transactions could read and decide inside one)

### When the write must cause something in another domain

Do not write the other domain's table, and do not make a second write from the handler. **Record it in your own table in the same batch** (an outbox: `reservation_events`, `invoice_notifications`, ...), and deliver it later from an entry point that retries (your domain's `cron.ts` or `queue.ts`). The delivery is then a write from a retrying entry point (next section).

## Writing from an entry point that retries (webhook, queue, cron)

A failure midway is retried, so the entry point **may write to several domains one after another**, as long as every write gives **the same result however many times it runs**:

- Use a unique key (`insertIfAbsent`), or a transition that only moves from the expected state (`transition(reach, id, from, changes)`)
- Write the thing that marks the work done (the outbox row, the webhook event) **last**
- Each write is still one call to one service; the entry point calls them in order

```ts
// domains/payments/webhook.stripe.ts (sketch): the payment is recorded, then the invoice is marked paid
const recorded = await payments.record(actor, event, now); // unique by event id
if (!recorded.ok) return reply.failure(recorded.error);
await invoices.markPaid(actor, recorded.value.invoiceId, now); // only from "sent"; a retry finds it paid and does nothing
```

## IDs and values from other domains

- **In routes**: use the owner domain's `…IdSchema` for params and bodies (`customerIdSchema` from `domains/customers/model`). Routes may import any domain's model values
- **Inside a domain** (`model` / `service`): another domain's ID is a plain `string` (`Invoice.customerId`). Only **types** may be borrowed from another domain (`import type`; `hnk/layer-imports` enforces it). For enum values shared with another domain (`roles`, ...), keep **your own copy** and make types check that the values match
- **Code that knows nothing of this app's business** (calendar dates, times of day, time-zone conversion) goes in `src/lib/` and may be imported as values from anywhere. The test is "could it move to another app as is?": a staff role belongs to staff (copy it or borrow its type), a calendar day is the same in any app (lib). `src/lib/` imports only zod and other lib files, so domains can never reach each other through it
- Another domain's table: only inside foreign-key `references()`. To read it in your own SQL (a filter or an order that needs it, with paging), use the window its owner's repo exports (`invoicesWithin(db, actor)`), and read the way the foreign key points: the domain that references the other reads it. The other way round makes the imports a cycle

## Reading another domain's table (windows)

When one SQL statement must look at another domain's table (a filter or an order that needs it, together with paging), read it through the window its owner exports: `…Within`, a subquery of the rows the reader may see. When the handler can read each domain and put the answers together (the copies on loan of the one book it shows), do that. But when any variant of a list (one of its filters) needs the other table in one statement, the whole list, every variant, is answered by the domain that reads the window. Do not split one list into two ways of reading.

```ts
// domains/invoices/repo.d1.ts: the owner decides which rows may be seen
export const invoicesWithin = (db: ReadDb, actor: Actor) =>
  db
    .select()
    .from(invoicesTable)
    .where(within(reachOf(actor)))
    .as("invoices_within");

// domains/payments/repo.d1.ts: the reader joins it like a table
const invoices = invoicesWithin(scope.reads, actor);
const rows = await scope.reads
  .select()
  .from(paymentsTable)
  .innerJoin(invoices, eq(invoices.id, paymentsTable.invoiceId));
```

- **Read the way the foreign key points**: the domain whose table references the other reads it (payments references invoices, so payments reads `invoicesWithin`). The other way round makes the imports a cycle, and `import/no-cycle` stops it. A list under the other's URL is still answered by the referencing domain: `GET /books?available=true` (books with a copy not on loan) is read by loans, which references books, and the books handler calls the loans service
- The window takes `actor` when the owner has a reach. When every row is visible to everyone, it takes only `db`
- **The reader declares the shape it returns** (`type ShelfBook = { id; title; …; onLoan: number }` in loans' model), as a writing service declares the shape it takes. It does not borrow the owner's type (`Book`) or its row mapper (`toBook`): a book with its copies on loan is the reader's shape, not the owner's thing
- Conditions whose meaning the owner decides (what a search word matches) are the owner's: the window takes them (`booksWithin(db, { q })`) and applies them inside. The reader adds only conditions on its own table (copies on loan)
- Another domain's table itself (`invoicesTable`) is used only inside foreign-key `references()` (`hnk/no-foreign-table-reads`)

## Counting (aggregates)

Put a count in the domain that owns the table being counted. Then ask **"should this number change with who is looking?"**

- If so (the loans a member sees as their own), use the owner's reach
- If not (copies a book has left to lend, a count a rule decides by), use no reach and take no `actor`

A reach narrows what is shown, never what a rule computes.

## Reach is the same for reads and writes

`within(reach)` is used in the WHERE of reads and of `update` / `delete`. Multiple conditions like "creator or assignee" can be written with `or(...)`, but the same condition also means **once you unassign yourself, you can no longer see it, and can no longer write it**.

## Things that hang under a parent (comments, ...)

- The resource nests under the parent's: `src/routes/issues/comments/index.ts`, mounted by the parent with `.route("/:issueId/comments", issueCommentsRouter)`. The child's paths are the rest only (`"/"`, `"/:id"`), and `request.param` lists the parent's param too (`{ issueId, id }`)
- The handler asks the parent's service whether the parent is visible (`issues.get(actor, issueId)`). If not, `NOT_FOUND`, returned in the handler
- The child repo filters by **parent ID**, not by reach. Name its methods `listOf(parentId)` / `findOf(parentId, id)` instead of `list(reach)` / `find(reach, id)`
- The parent ID is a plain `string` inside the child domain. Permission checks ("the author or an admin") are pure functions in model
- `pnpm hnk g domain comments` writes only the domain. Write the resource in `src/routes/issues/comments/` and mount it from the parent
