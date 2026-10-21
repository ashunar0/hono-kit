# Where things go

Two axes, and two paths. Read this before writing any file.

## Two axes: resources and domains

The nouns in the URL (resources) and the nouns of the domain (domains) are different things, so they live apart.

- **Resources** (`src/routes/<noun>/`): what a client points at. Cut by the URL: the directory is the path and `[id]` is `:id` (`/customers/:customerId/invoices` → `routes/customers/[customerId]/invoices/`). Each method is an export of its `index.ts`. Directories are nouns, except a state transition: a verb directory under the thing (`invoices/[id]/send/`) with only `POST` ([state.md](state.md))
- **Domains** (`src/domains/<name>/`): who keeps which rules. Cut by the rules a thing must keep
- **Jobs** (`src/jobs/<name>.ts`): entry points that are not HTTP (cron, a queue). Named by what starts them (`daily.ts`, `reminders-queue.ts`). Like resources, they live outside domains and receive services from deps
- **One way only**: entry points (routes and jobs) use domains; domains know nothing of them. A route may use as many domains as it needs. One domain's code never uses another domain's service; the handler joins them
- **Lib** (`src/lib/<what>.ts`): code that knows nothing of this app's business, so it could move to another app as is (dates, times, time zones). Name the file by what it holds (`time.ts`), never `utils.ts`. Anything that names a thing of this app (a role, a status) belongs to its domain. Move something here when a second copy would appear

They often share a word (`routes/invoices/` and `domains/invoices/`) and often do not (`/customers/:customerId/invoices` is a customer's invoices, written with the invoices domain). Do not bend one to match the other.

## Imports

Inside your own domain (`src/domains/<name>/`) or your own resource (`src/routes/<noun>/` and everything under it), import with a relative path (`../_response`). Anything outside it goes through `#src/` (`#src/domains/invoices/model`, `#src/middleware/auth`), the subpath import in `package.json` (`"#src/*": "./src/*.ts"`). A directory is imported by its `index` (`#src/db/index`). So an import shows whether it is your own or someone else's.

## Reads and writes

There are two paths.

```
write (POST, PATCH, DELETE): route → service → model → repo    keeps the rules
read (GET):                  route → queries → …Within          keeps the reach
```

What a GET returns is the resource's business, so the read lives next to the resource (`src/routes/<noun>/_queries.ts`). Put it in the narrowest directory whose endpoints use it: `invoices/_queries.ts` serves both `invoices/index.ts` and `invoices/[id]/index.ts`.

- queries take db as `ReadDb` (SELECT only). Export one `…Queries(db)` per file (`invoicesQueries`); `pnpm hnk gen` wires every `_queries.ts` into deps under that name. The handler receives them from deps (`{ invoicesQueries }`)
- Never read a table directly. Read through the `…Within` its owner's repo exports (`hnk/no-foreign-table-reads`). When what is seen depends on who looks, take `actor` and pass it on (`invoicesWithin(db, actor)`): who sees what stays inside the owner. A number that is the same whoever looks comes from a window that takes no actor
- Return the screen's row type (`InvoiceRow`). When you return the select as is, infer the type from the select; write it by hand only for a shape you put together in JS (a summary merged from several selects). Make no rules; borrow them from model when needed (`todayOf`)
- Reads before a write (an entry check, materials for the decision) go through services. The read after a write, to show the result, goes through queries: a POST or PATCH returns what the GET of that thing returns. If it is gone right after the write, throw
- A write service does not return the thing for showing, only what the caller needs to act next: the ID for a create, otherwise `void`. Showing is the job of queries
- A read a rule needs (counting before deciding) stays in the domain's repo
- A handler may use any queries from deps, not only its own noun's: `GET /customers/:customerId/invoices` reads through `invoicesQueries` and shows them with `routes/invoices/_response.ts`
