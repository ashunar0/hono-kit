# domains preset

Rules for where business logic goes (`src/domains/<noun>/`), with an oxlint plugin that stops imports breaking them. Not part of hono-kit and not published to npm: a project copies these files and owns them.

## Copy

```sh
cp -r presets/domains/docs presets/domains/lint <your-app>/
```

`.oxlintrc.json`:

```json
{
  "rules": {
    "typescript/no-floating-promises": ["error", { "checkThenables": true }],
    "domains/imports": "error"
  },
  "jsPlugins": ["./lint/domains.mjs"]
}
```

`AGENTS.md`:

```md
The business rules live in `src/domains/`: read [docs/domains.md](docs/domains.md) before touching them.
```

To change the rules, change them here and copy again.
