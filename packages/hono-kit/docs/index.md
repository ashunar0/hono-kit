# hono-kit docs

The rules of an app built on hono-kit, for the installed version. hono-kit fixes only the HTTP entry (`src/routes/`) and how to write it; how the rest of `src/` is split is up to the app. When unsure, read an existing resource under `src/routes/` to the end and write the same way.

Always read:

- [layout.md](layout.md): the files hono-kit fixes, and how to import
- [rules.md](rules.md): the rules every file keeps (time, actor, failures, check order, IDs, unique constraints, replies, lists, module scope, tests)

Read before you…

- **add a resource or an endpoint** under `src/routes/`: [resources.md](resources.md)
- **add cron, queue, webhook, mailer or gateway, or replace them in tests**: [inbound-outbound.md](inbound-outbound.md)
