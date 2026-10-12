# Using another module

A complete example (records uses subjects):

```ts
// records/service.ts: the using side declares only the shape it needs. The ID is a plain string, actor is Actor
export type SubjectLookup = { isVisible(actor: Actor, subjectId: string): Promise<boolean> };
export function recordsService(repo: RecordsRepository, subjects: SubjectLookup) {
  /* ... */
}

// api/deps.ts: build the other module first, then wire it, applying the ID brand
const subjects = subjectsService(subjectsRepository(scopeTo(db, subjectsTable)));
const records = recordsService(recordsRepository(scopeTo(db, recordsTable)), {
  isVisible: async (actor, id) => (await subjects.get(actor, subjectId(id))).ok,
});

// records/repo.d1.ts: another module's table may be imported only for foreign-key references()
subjectId: text("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
```

If the other thing is not visible, treat it as absent: `NOT_FOUND` (checked after your own input validation).

- **Do not import** another module's service or repo. The using service declares the shape it needs (returning only what it uses), and `deps.ts` wires it. In `deps.ts`, write the dependency first
- Declare another module's ID as a plain `string` on the using side; in `deps.ts`, apply the other module's `…Id(id)` when passing it
- Another module's table: only inside foreign-key `references()`. To read, use the owner's `…Within(db, actor)`
- To let another module **write**, the owner exposes `commands/<operation>.ts` (see "commands/" below)
- The system (cron, webhook) writes or deletes only through `commands/`

## Values from other modules cannot be imported

`domain` / `service` / `commands` can borrow only **types** from other modules (`import type`; `hnk/layer-imports` enforces it). Values such as `userId()` or `roles` cannot be borrowed.

- To accept another module's ID as input, take it as `z.string()` and apply the brand in the repo (which may use `foreign:domain` values) or in `deps.ts`. A `.transform(userId)` in domain fails lint
- For enum values shared with another module (`roles`, ...), keep **your own copy** in the using domain (do not share). Make types check that the values match
- Inputs that need a value conversion move to routes or the repo

## Letting another module write (commands/)

The owner exposes `commands/<operation>.ts`, and `deps.ts` wires it into the user.

```ts
// notifications/commands/notifyAssigned.ts: the writing side (owner). Fulfills the shape the user declared
export const notifyAssigned =
  (repo: NotificationsRepository) =>
  async (
    target: { orgId: string; userId: string; issueId: string },
    now: Date,
  ): Promise<void> => {
    await repo.insertIfAbsent({/* ... */});
  };

// issues/service.ts: the using side declares only the shape it needs
export type AssignmentNotifier = (
  target: { orgId: string; userId: string; issueId: string },
  now: Date,
) => Promise<void>;

// api/deps.ts
const notify = notifyAssigned(
  notificationsRepository(scopeTo(db, notificationsTable)),
);
const issues = issuesService(
  issuesRepository(scopeTo(db, issuesTable)),
  notify,
);
```

The policy depends on the entry point that calls it.

- **From an entry point with retries (webhook, queue, cron)**: a failure midway is retried, so `commands` must give **the same result however many times it runs** (unique keys, `status = from`). Change one module per write
- **From a user's HTTP request**: there are no retries. Only call side effects **whose absence does not break the business** (notifications, ...). Rules:
  1. Finish the main write first, then call `commands`
  2. Prevent duplicates with a unique constraint (e.g. notifications are unique by `issueId` and `assigneeId`). Use `insertIfAbsent`
  3. If `commands` fails, let it throw (500). The main write is done, and the notification may be missing; use it knowing that
  4. Anything whose absence hurts (money, stock) is not called from HTTP; go through a queue

## Reach is the same for reads and writes

`within(reach)` is used in the WHERE of reads and of `updateWithin` / `deleteWithin`. Multiple conditions like "creator or assignee" can be written with `or(...)`, but the same condition also means **once you unassign yourself, you can no longer see it, and can no longer write it**.

## Things that hang under a parent (comments, ...)

- The child repo filters by **parent ID**, not by reach. Name its methods `listOf(parentId)` / `findOf(parentId, id)` instead of `listWithin` / `findWithin`
- Ask the parent's service whether the parent is visible (declare the `get(actor, id)` shape). If not visible, `NOT_FOUND`
- The parent ID is a plain `string` on the child side (`parentIdSchema`). Permission checks ("the author or an admin") are pure domain functions
- `pnpm hnk g module comments` produces a CRUD mounted at `/comments`, so rewrite all of it. Mount with `.route("/issues", commentsRouter)`, with paths like `/{id}/comments`
