# hono-kit docs

The rules of an app built on hono-kit, for the installed version. hono-kit fixes where things go and what they look like. **The generator produces the shape of a domain; do not invent layers.** When unsure, read an existing domain and an existing resource under `src/routes/` to the end and write the same way.

Always read:

- [layout.md](layout.md): where things go. Two axes (resources and domains) and two paths (reads and writes)
- [rules.md](rules.md): the rules every file keeps (actor, failures, check order, writes, reach, unique constraints, lists)

Read before you…

- **add a domain** (`pnpm hnk g domain`): [domains.md](domains.md)
- **add a resource or an endpoint** under `src/routes/`: [resources.md](resources.md)
- **make a thing whose state moves** (draft → sent), or an enum: [state.md](state.md)
- **use another domain** (read or write across domains, read another domain's table in SQL, count rows, outbox, entry points that retry, things under a parent): [cross-domain.md](cross-domain.md)
- **add cron, queue, webhook, mailer or gateway, or replace them in tests**: [inbound-outbound.md](inbound-outbound.md)
