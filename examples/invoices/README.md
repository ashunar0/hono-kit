# invoices

hono-kit の決まりどおりに書いた例のアプリ（Hono + Cloudflare Workers + D1）。請求書を中心に、domain をまたぐ支払い・cron・queue・webhook・組織と共有まで入っている。決まりは [hono-kit の docs](../../packages/hono-kit/docs/index.md) にあり、ここに書くのはこのアプリの業務だけ。

```sh
pnpm check   # 型・lint・format・テスト、hono-kit の lint のテスト、docs の許可表
```

## 業務の決めごと

- **組織は User が持ち、範囲（Reach）がデータで運ぶ**。システムは全組織、admin は自分の組織の全員分、member は自分の分だけ。どの範囲も組織の線を越えない
- **共有は同じ組織の中で、閲覧と編集の 2 段階**。member の範囲は「自分のもの＋共有されたもの」。repo が範囲を解釈し、行と一緒に access（`manage` / `edit` / `view`）を返す。`canEdit` と `canManage` は access を受け取る純関数。共有できるのは所有者と組織の admin
- `test/reads-contract.test.ts` は repo が出す `〜Within` を全部拾い、「他の組織のデータが出ない」を当てる。読みを足したら、その表の行を seed に足さないとテストが落ちる

## 未決

- 共有の相手が同じ組織かは確かめていない（利用者の一覧が無い）。違う組織でも、範囲が組織で絞るので見えないだけ
- 共有の取り消しと書き込みの間の競合: access を見てから書くまでの間に取り消されると、1 回は書ける（書き込みは組織の範囲に留まる）。SQL に access の判定を持たせるとルールが 2 か所になるので、model の 1 か所を取った
- 閲覧だけを共有された人も、支払いを始められる（`getPayable` は access を見ない）
