# hono-kit

Hono で書くときの「置き場所」と「部品の形」を決める規約と、その生成器・lint。
誰が書いても（AI が書いても）同じ形になることを狙っている。

> 非公式。Hono チームとは関係ない。

[English](README.md)

## なぜ

AI にバックエンドを書かせると、置き場所・失敗の返し方・権限の確かめ方が毎回少しずつ揺れる。
hono-kit は形を先に決め、外れたものを型と lint で止める。lint の指摘には直し方を書いてあるので、AI が自分で気づいて直せる。

フレームワークでもプラットフォームでもない。素の Hono の上に薄く載るだけで、アプリに載る依存は `hono` だけ。ルーティングは [Void](https://void.cloud/guide/server-routing) の形を借りていて（`src/routes/` のディレクトリが URL）、hono-kit が決めているのはその下の層。

## 始め方

```sh
pnpm create hnk my-app
cd my-app && pnpm install
pnpm hnk g domain posts
pnpm db:generate && pnpm check
```

`pnpm check` は型検査・lint・format の確認・テストを回し、最後に失敗を一覧で出す。AI には「これを通して」と言えば足りる。

## 決まり

決まりはパッケージの中にあり、インストールした版と一緒に変わる。入口は `node_modules/hono-kit/docs/index.md`（[GitHub](packages/hono-kit/docs/index.md)）。生成したアプリの `AGENTS.md` は、そこを指しているだけ。

## 範囲

- 今は Cloudflare Workers + D1 + Drizzle
- 検証は Standard Schema を満たすものなら何でも（zod と valibot で確かめた）
- 0.x。実プロダクトで使いながら形を変える

例のアプリ: [examples/invoices](examples/invoices)。請求書を中心に、domain をまたぐ支払い・cron・queue・webhook・組織と共有まで入っている。

## License

MIT
