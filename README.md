# hono-kit

Conventions for writing the HTTP entry of a backend with Hono — with a scaffolder and lint rules.
The goal: whoever writes the code, including AI, it comes out in the same shape.

> Unofficial. Not affiliated with the Hono team.

[日本語](README.ja.md)

## Why

When AI writes a backend, the details drift every time: which file is which URL, how failures are returned, how access is checked.
hono-kit fixes the shape up front and stops deviations with types and lint. Every lint message says how to fix it, so the AI can notice and correct itself.

It is not a framework or a platform. It sits thinly on top of plain Hono, and what it puts into your app is `hono` only. The routing is borrowed from [Void](https://void.cloud/guide/server-routing) (directories under `src/routes/` are the URL). hono-kit stays at that height without the build, deploy and infrastructure, and instead makes each endpoint explicit with types and lint.

## Getting started

```sh
pnpm create hnk my-app
cd my-app && pnpm install
pnpm check
```

`pnpm check` runs typecheck, lint, format check and tests, and lists all failures at the end. With AI, "make `pnpm check` pass" is the one instruction you need.

## The rules

The rules ship inside the package, so they match the installed version: start at `node_modules/hono-kit/docs/index.md` ([on GitHub](packages/hono-kit/docs/index.md)). The generated app's `AGENTS.md` only points there.

## Scope

- Cloudflare Workers + D1 + Drizzle for now
- Any Standard Schema library works for validation (tested with zod)
- 0.x. The shape will change as it gets used in real products

## License

MIT
