# hono-kit

Hono でバックエンドを書くときの、HTTP の入口の書き方を決める規約と、その生成器・lint。
誰が書いても（AI が書いても）同じ形になることを狙っている。

> 非公式。Hono チームとは関係ない。

[English](README.md)

## なぜ

AI にバックエンドを書かせると、URL とファイルの対応・失敗の返し方・権限の確かめ方が毎回少しずつ揺れる。
hono-kit は形を先に決め、外れたものを型と lint で止める。lint の指摘には直し方を書いてあるので、AI が自分で気づいて直せる。

フレームワークでもプラットフォームでもない。素の Hono の上に薄く載るだけで、アプリに載る依存は `hono` だけ。ルーティングは [Void](https://void.cloud/guide/server-routing) の形を借りていて（`src/routes/` のディレクトリが URL）、hono-kit はその高さからビルド・デプロイ・インフラを抜いたもの。そのかわりに endpoint の書き方を型と lint で明示させる。

## 始め方

```sh
pnpm create hnk my-app
cd my-app && pnpm install
pnpm check
```

`pnpm check` は型検査・lint・format の確認・テストを回し、最後に失敗を一覧で出す。AI には「これを通して」と言えば足りる。

## 決まり

決まりはパッケージの中にあり、インストールした版と一緒に変わる。入口は `node_modules/hono-kit/docs/index.md`（[GitHub](packages/hono-kit/docs/index.md)）。生成したアプリの `AGENTS.md` は、そこを指しているだけ。

## 範囲

- 今は Cloudflare Workers + D1 + Drizzle
- 検証は Standard Schema を満たすものなら何でも（zod で確かめた）
- 0.x。実プロダクトで使いながら形を変える

## License

MIT
