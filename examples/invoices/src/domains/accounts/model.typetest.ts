import { authenticatedAccount, orgId, accountId } from "./model";

// 利用者の ID と組織の ID は、どちらも文字列だが、取り違えると型エラーになる
export function idsAreNotInterchangeable() {
  // 正しい順序
  authenticatedAccount(accountId("u1"), orgId("o1"), "member");

  // @ts-expect-error 順序を逆にして渡せない
  authenticatedAccount(orgId("o1"), accountId("u1"), "member");
  // @ts-expect-error 素の string は渡せない
  authenticatedAccount("u1", "o1", "member");
}
