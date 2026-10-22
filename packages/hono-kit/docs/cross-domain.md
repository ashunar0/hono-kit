# When a request touches several domains

Domains do not call each other. `src/deps.ts` builds each domain on its own line, with nothing wired between them. The joining happens at the entry point: the handler of a resource (`src/routes/<noun>/index.ts`), a webhook, a queue consumer or a cron job.

A complete example (a customer's invoices, billed from products):

```ts
// src/routes/customers/invoices/index.ts: read from as many domains as needed, write once
async (c, reply, { customers, products, invoices, invoicesQueries }) => {
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

  // The write returns only the ID. Read it again the way its GET does
  const invoice = await invoicesQueries.get(actor, result.value);
  if (invoice === null)
    throw new Error(`invoice ${result.value} is gone right after the write`);

  return reply(200, invoiceResponse(invoice));
};

// domains/invoices/service.ts: declare the shape you take, not another domain's types
export type Billed = {
  customer: { id: string; organizationId: string };
  items: { id: string; organizationId: string; price: number }[];
};
```

## Reading

- A handler may take as many services from deps as it needs (`{ customers, products, invoices }`). It never imports a service or repo
- A GET reads through its resource's queries instead ([layout.md](layout.md#reads-and-writes))
- A thing named in the URL that does not exist is a 404 returned in the handler, before calling the writing service. Write it out in each handler; do not hide it in middleware
- If the other thing is not visible to the actor, treat it as absent: `NOT_FOUND`

## Writing from a user's request (HTTP)

There are no retries, so **one call to one service**. Two writes in a row leave the first done when the second fails. `hnk/route-writes-once` stops a second write call; it tells reads by name, so a service's reads start with `get` or `list` (`getCopiesTaken`, `listOverdue`).

- The handler passes what it read as values. The writing service **checks that they belong together** before deciding, because rules that must hold from every entry point live in the service:
  - Values the client chose (product ids in the body) that do not match → a domain failure (`PRODUCT_NOT_FOUND`)
  - Values the handler read from the DB that do not match (`member.storeId !== store.id`) → a bug: `throw`
- Ask "is this check needed when cron calls it too?" If not (404 for an ID in the URL), it goes in the handler. If so (a permission that needs the row, a rule across things), it stays in the service. A permission the role alone decides is the endpoint guard (`requireRole`)
- Writes that must happen together go inside that one call, in one batch (the repo receives `batch`: `wireBatch(db)`, next to its scopes). One repo call writes all or nothing; how is the store's business (D1 sends a fixed batch, a store with transactions could read and decide inside one)

### Where the domain line goes

When two writes look like they belong to different domains, ask: **does anyone get hurt right away if only one of them is written?**

- Yes (an invoice is visible without its line items) → put them in the same domain. The repo receives one scope per table and writes both in one batch, in one call
- No (the notification mail goes out a few minutes late) → keep them in separate domains and deliver later through an outbox (next section)

Split them while the answer is yes, and there is no correct way left to write them.

### When the write must cause something in another domain

Do not write the other domain's table, and do not make a second write from the handler. **Record it in your own table in the same batch** (an outbox: `reservation_events`, `invoice_notifications`, ...), and deliver it later from an entry point that retries (a job in `src/jobs/`: cron or a queue). The delivery is then a write from a retrying entry point (next section).

## Writing from an entry point that retries (webhook, queue, cron)

A failure midway is retried, so the entry point **may write to several domains one after another**, as long as every write gives **the same result however many times it runs**:

- Use a unique key (`insertIfAbsent`), or a transition that only moves from the expected state (`transition(reach, id, from, changes)`)
- Write the thing that marks the work done (the outbox row, the webhook event) **last**
- Each write is still one call to one service; the entry point calls them in order

```ts
// routes/webhooks/stripe/index.ts (sketch): the payment is recorded, then the invoice is marked paid
const recorded = await payments.record(actor, event, now); // unique by event id
if (!recorded.ok) return reply.failure(recorded.error);
await invoices.markPaid(actor, recorded.value.invoiceId, now); // only from "sent"; a retry finds it paid and does nothing
```

## IDs and values from other domains

- **In routes**: use the owner domain's `…IdSchema` for params and bodies (`customerIdSchema` from `domains/customers/model`). Routes may import any domain's model values
- **Inside a domain** (`model` / `service`): another domain's ID is a plain `string` (`Invoice.customerId`). Only **types** may be borrowed from another domain (`import type`; `hnk/layer-imports` enforces it). For enum values shared with another domain (`roles`, ...), keep **your own copy** and make types check that the values match
- **Code that knows nothing of this app's business** (calendar dates, times of day, time-zone conversion) goes in `src/lib/` and may be imported as values from anywhere. The test is "could it move to another app as is?": a staff role belongs to staff (copy it or borrow its type), a calendar day is the same in any app (lib). `src/lib/` imports only zod and other lib files, so domains can never reach each other through it
- Another domain's table: only inside foreign-key `references()`. To read it, go through its window (next section)

## Reading another domain's table (windows)

Read a table through the window its owner's repo exports: `…Within`, a subquery of the rows the actor sees. Who sees what (`reachOf`) and turning it into a WHERE happen in one place, inside the owner.

```ts
// domains/invoices/repo.d1.ts: the owner decides which rows are seen
export const invoicesWithin = (db: ReadDb, actor: Actor) =>
  db
    .select()
    .from(invoicesTable)
    .where(within(reachOf(actor)))
    .as("invoices_within");

// routes/invoices/_queries.ts: the reader reads it like a table
const invoices = invoicesWithin(db, actor);
const rows = await db
  .select()
  .from(invoices)
  .where(eq(invoices.customerId, customerId));
```

- **Most reads are queries.** queries live outside the domains, so reading any window makes no import cycle. A list or a single one is answered by that resource's queries, in one statement
- **What a search word matches is the owner's to decide**: the window takes it and applies it inside (`booksWithin(db, { q })`)
- **Only a domain reading for a rule reads the way the foreign key points**: the domain whose table references the other reads it (loans finds "their own" loans through `membersWithin`). The other way round makes the imports a cycle, and `import/no-cycle` stops it
- A window takes the actor, never a reach: the reader does not know how reach is decided. When every row is visible to everyone, it takes no actor
- When a reach is decided through another domain (a member's own loans are the loans of the member rows they see), the reach carries the actor (`{ kind: "own"; actor }`) and `within` passes it to that domain's window (`membersWithin(db, reach.actor)`)
- Another domain's table itself (`invoicesTable`) is used only inside foreign-key `references()`, in queries and in domains alike (`hnk/no-foreign-table-reads`)

## Counting (aggregates)

**A number shown on a screen is counted by queries, through the window. A number a rule decides by is counted by the repo of the domain that owns the table.** Then ask **"should this number change with who is looking?"**

- If so (the loans a member sees as their own), count through the window that takes the actor
- If not (copies a book has left to lend), the owner exports a window that takes no actor (`onLoanByBookWithin(db)`), so what "on loan" means stays in the owner. A domain's repo counting for a rule counts its own table as it is, so it takes no reach

Windows join like tables. A count window has no row for what has none, so use `leftJoin` and `coalesce`:

```ts
// routes/books/_queries.ts: each book with the copies on loan
const books = booksWithin(db, { q });
const onLoan = onLoanByBookWithin(db);
const rows = await db
  .select({
    id: books.id,
    stock: books.stock,
    onLoan: sql<number>`coalesce(${onLoan.onLoan}, 0)`,
  })
  .from(books)
  .leftJoin(onLoan, eq(onLoan.bookId, books.id));
```

A reach narrows what is shown, never what a rule computes.

## Reach is the same for reads and writes

`within(reach)` is used in the WHERE of reads and of `update` / `delete`. Multiple conditions like "creator or assignee" can be written with `or(...)`, but the same condition also means **once you unassign yourself, you can no longer see it, and can no longer write it**.

## Things that hang under a parent (comments, ...)

- The resource nests under the parent's: `src/routes/issues/[issueId]/comments/index.ts` (`/issues/:issueId/comments`) and `…/comments/[id]/index.ts`. `request.param` lists the parent's param too (`{ issueId, id }`)
- Whether the parent is visible: a GET asks the parent resource's queries (`issuesQueries.get(actor, issueId)`), a write asks the parent's service (`issues.get(actor, issueId)`). If not, `NOT_FOUND`, returned in the handler
- The child list is read by the child resource's queries, through the child's window, filtered by the parent ID (`commentsWithin(db)` with `where(eq(comments.issueId, issueId))`)
- The child repo keeps only the writes and the reads a rule needs. It filters by **parent ID**, not by reach: `findOf(parentId, id)` instead of `find(reach, id)`
- When the parent is deleted and its children go with it, give the child's foreign key `onDelete: "cascade"` (`references(() => issuesTable.id, { onDelete: "cascade" })`). The child domain declares it on its own table, so the parent's repo never writes the child's table. If a child must outlive its parent, pick another value and write why next to it
- The parent ID is a plain `string` inside the child domain. Permission checks ("the author or an admin") are pure functions in model
- `pnpm hnk g domain comments` writes only the domain. Write the resource in `src/routes/issues/[issueId]/comments/`; `pnpm hnk gen` registers it
