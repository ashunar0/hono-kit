# Where things go

hono-kit fixes only the places below. How the rest of `src/` is split (domains, services, repositories, ...) is up to the app.

| File                                  | Role                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                        | The app's entry: `buildApp` and `createWorker`                                                           |
| `src/env.ts`                          | `AppEnv`: the bindings, and what a request holds (`account`, `actor`, `now`)                             |
| `src/deps.ts`                         | The one place that builds what handlers and jobs receive (like `main` in Go). The template's is `{ db }` |
| `src/middleware/auth.ts`              | `Account`, and the guards an endpoint names in `auth` (`requireAuth`, `allowAnonymous`)                  |
| `src/db/index.ts`, `src/db/schema.ts` | The database driver, and the tables                                                                      |
| `src/routes/`                         | The endpoints. The directory is the URL ([resources.md](resources.md))                                   |
| `src/routes.gen.ts`                   | Written by `hnk prepare`. Never edit it; not committed                                                   |

## Imports

Inside your own resource (`src/routes/<noun>/` and everything under it), import with a relative path (`../_response`). Anything outside it goes through `#src/` (`#src/middleware/auth`), the subpath import in `package.json` (`"#src/*": "./src/*.ts"`). A directory is imported by its `index` (`#src/db/index`). So an import shows whether it is your own or someone else's.
