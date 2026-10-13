import type { User } from "./domains/users/model";

/** withUser が積む文脈変数。ハンドラ側で書き写さないための単一定義 */
export type AuthVariables = {
  /** セッションの利用者。ログインしていなければ null。handler は読まず、guard が actor に決める */
  user: User | null;
};

/** buildApp が 1 リクエストに 1 回だけ積む今の時刻。handler は new Date() ではなくこれを使うので、テストで固定できる */
export type ClockVariables = {
  now: Date;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AuthVariables & ClockVariables;
};

declare module "hono-kit" {
  interface Register {
    env: AppEnv;
  }
}
