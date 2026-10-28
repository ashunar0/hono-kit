# Where things go

hono-kit fixes only the places below. How the rest of `src/` is split (domains, services, repositories, ...) is up to the app.

| File                                  | Role                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                         | The app's entry, like `main` in Go: `makeDeps` (exported; `c.var.deps` in handlers and middleware, `{ deps }` in jobs), `buildApp` and `createWorker` |
| `src/auth.ts`                         | `sessionUser(headers)`: who is signed in, read with the app's auth provider                              |
| `src/db/index.ts`, `src/db/schema.ts` | The database driver, and the tables                                                                      |
| `src/routes/`                         | The endpoints. The directory is the URL ([resources.md](resources.md))                                   |
| `src/routes.gen.ts`                   | Written by `hnk prepare`. Never edit it; not committed                                                   |

`src/main.ts` holds only what the app chose: what goes in deps, its own routes (an auth provider's `/api/auth/*`) and its own middleware. `createApp({ makeDeps, clock })` puts `now` and deps on every request and answers failures; `registerRoutes(app)` comes last, since Hono runs what was registered first. The guards (`requireAuth`, `allowAnonymous`), `CurrentUser` and `UserId` come from `hono-kit`, and so do the types of deps and bindings (`hnk prepare` reads them from `makeDeps`).

## Imports

Inside your own resource (`src/routes/<noun>/` and everything under it), import with a relative path (`../_response`). Anything outside it goes through `#/` (`#/db/index`), the subpath import in `package.json` (`"#/*": "./src/*.ts"`). A directory is imported by its `index`. So an import shows whether it is your own or someone else's.
