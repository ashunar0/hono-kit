import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthVariables } from "#src/env";
import type { Role, Account } from "#src/domains/accounts/model";
import { fail, Forbidden, guard, Unauthorized } from "hono-kit";

/**
 * セッションのアカウントを文脈に積む。未ログインでも通す。
 *
 * TODO: domains/auth/ が cookie のセッションを解いて返すようになったら、
 * その結果を積む。認証提供元がまだ無いあいだは常に null
 */
export const withAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("account", null);
  await next();
};

/**
 * ログインを要求する。endpoint の auth に置くと（`auth: requireAuth`）、その先の handler で
 * actor（誰として操作するか）が Account になる（account は null を含んだまま）。
 * Unauthorized は responses に自動で足される
 */
export const requireAuth = guard(
  [Unauthorized],
  createMiddleware<{
    Variables: AuthVariables & { actor: Account };
  }>(async (c, next) => {
    const account = c.get("account");
    if (account === null) throw fail(Unauthorized);

    c.set("actor", account);
    await next();
  }),
);

/**
 * ログインと役割を要求する。役割だけで決まる権限（レポートは admin だけ）はここに置き、
 * 行を見る権限（所有者か共有された人）は service に置く。Unauthorized と Forbidden は responses に自動で足される
 */
export const requireRole = (...roles: Role[]) =>
  guard(
    [Unauthorized, Forbidden],
    createMiddleware<{
      Variables: AuthVariables & { actor: Account };
    }>(async (c, next) => {
      const account = c.get("account");
      if (account === null) throw fail(Unauthorized);
      if (!roles.includes(account.role)) throw fail(Forbidden);

      c.set("actor", account);
      await next();
    }),
  );

/**
 * 認証を要求しないことを明示する。誰でも通し、actor は null（誰かは問わない）。
 *
 * auth は必須なので、公開の endpoint は `auth: allowAnonymous` と書く。
 * grep すればこのアプリの無認証エンドポイントが列挙できる
 */
export const allowAnonymous = createMiddleware<{ Variables: { actor: null } }>(async (c, next) => {
  c.set("actor", null);
  await next();
});
