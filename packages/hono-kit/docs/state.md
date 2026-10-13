# Things whose state moves (draft → sent, ...)

## Enums

model holds an `as const` array (`…Statuses`) and a zod enum (`…StatusSchema`). The repo's `text("status", { enum: …Statuses })` and the routes schema use the same ones, so `row.status` comes back typed and needs no parsing.

## Transitions

- Transitions are `POST /:id/<verb>` on the thing's resource router (`POST /invoices/:id/send`), not a `PATCH` of the status
- service does `find` (NOT_FOUND if absent) → a check (a pure function in model such as `canSend(invoice)`) → `transition`
- The repo may add `transition(reach, id, from, changes)`: one statement with `WHERE id AND status = from AND within(reach)`. If it returns null, another request moved first, so return the same conflict
- A transition that is not allowed is a domain failure `{ code: "…_NOT_SENDABLE", kind: "conflict", message }`. When the docs do not name the code, make it `<THING>_` + what happened; a name the docs give is the API's contract, so use it as is
- A rule that means something only in some states (a cancel deadline means nothing for a finished visit) is checked after the state, so the answer is first that the thing cannot be done at all
