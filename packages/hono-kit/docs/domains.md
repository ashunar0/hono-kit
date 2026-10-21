# Adding a domain

Read [layout.md](layout.md) first.

A domain's line is the line of what is written together. Tables that must never be written one without the other (an invoice and its line items) go in one domain, written in one call. What may catch up a little later (a mail when an invoice is sent) goes in another domain, joined through an outbox. The generator writes a domain with one table; add more tables when they belong together.

`pnpm hnk g domain <name>` writes the bare shape under `src/domains/<name>/` (`model / service / repo.d1 / service.test`) and wires it into `src/deps.ts` above the `// hnk:` lines. The singular (`Invoice`, `invoiceId`) is guessed from the plural; when the guess cannot be trusted (`data`, `status`) it stops and asks for `--singular <name>`. It is a thing with only `id`, `createdAt` and `updatedAt`, and `get` / `create`. **Grow it into the real thing:**

1. `model.ts`: fields, `…InputSchema` (zod; `trim()` before checking length), failures (`Failure`), `reachOf(actor)` when someone may touch only some of them (a union such as `{ kind: "all" } | { kind: "own"; userId: string }`), and `may…(actor, thing)` when a permission needs the row
2. `repo.d1.ts`: columns, `to…` (row → thing), `within` (reach → WHERE), the `…Within(db, actor)` window the reads go through, indexes for the list order
3. `service.ts`: the steps. Declare the `…Repository` shape here
4. Run `pnpm db:generate`

| File         | Role                                                |
| ------------ | --------------------------------------------------- |
| `model.ts`   | The thing (What): types, rules, ID brands, failures |
| `service.ts` | The steps (How) and the adapter shapes they need    |
| `repo.d1.ts` | Adapter: table, D1 implementation, row → thing      |

Every arrow points to model and service: adapters (repo, gateway, mailer, queue) fulfill the shapes service declares. `hnk/layer-imports` says what each file may import. Grow only **when a second one appears**: another adapter (`gateway.stripe.ts`, `mailer.resend.ts`). **Do not add them up front.**
