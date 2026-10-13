# Pitfalls

Details that matter only in some situations. AGENTS.md says when to read each one.

## Writing more than one statement in one repo call

When one repo call writes more than one statement (a thing and its child rows, a state change and its outbox row), pass `batch` (`wireBatch(db)` in `src/deps.ts`) to the repo next to the scopes, and run the statements built by the scopes as one batch. The batch builds nothing itself, so a repo still writes only its own domain's tables.

- Many rows go in with `scope.insertMany(rows)`. D1 binds at most 100 values in a statement, so it splits them into as many statements as needed; spread them into the batch
- D1 has no transaction that reads and decides midway: a batch is fixed before it is sent. A condition like "only if the update above won" goes into SQL (`scope.insertFrom(...)` with a `WHERE` on the row the update set)

## Unique constraints

Let the table's `uniqueIndex` decide: reading first and then writing can be interleaved, so the index is the guard for two requests at once. Never rely on a check you wrote instead of it.

- Wrap the repo's `insert` / `update` in `try/catch`. If `isUniqueViolation(error)` from `src/db/errors` is true, return a failure value (rethrow otherwise), and service turns it into the domain's conflict `Failure`
- When the docs fix the order of checks (overdue before duplicate before stock), read and check in that order first, and still turn the index's violation into the same failure
- When a repo returns both "absent" and "duplicate", return a union with a string literal that cannot be confused with the thing (`Subject | "nameTaken" | null`)
- Test DBs are shared between calls, so use fresh unique values (`crypto.randomUUID()`)

## Dates without time

A text column holding `YYYY-MM-DD`. Validate with `z.iso.date()`: it checks the calendar too (`2026-02-30` fails), while `new Date("2026-02-30")` would quietly become March 2. Put the schema and date math (`from + 7 days`) in `src/lib/` as pure functions; never read the current time there.

## Rows created in the same millisecond

They come in `id` order, not in the order they were created. Tests that compare an order create rows with different `now`, or compare as a set.

## Counting another table's rows for each row

Count with `leftJoin` + `groupBy` (copies on loan per book), and narrow by the count with `having`. Do not write the subquery inside `sql`: when a query reads one table, drizzle drops the table name from columns, so the outer `${booksTable.id}` becomes a bare `"id"` that the subquery reads as its own.
