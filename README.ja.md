# hono-kit

素の Hono で書く人が毎回気をつけていたこと（置き場所・返すもの・誰が呼べるか・失敗の番号・実行環境の癖）を、型と lint と生成器で書いた時点に止める。
止めたときは直し方まで示すので AI が自分で直せるし、hono-kit を抜いても素の Hono として読める。

> 非公式。Hono チームとは関係ない。

[English](README.md)

## なぜ

AI にバックエンドを書かせると、URL とファイルの対応・失敗の返し方・権限の確かめ方が毎回少しずつ揺れる。
hono-kit は形を先に決め、外れたものを止める。

フレームワークでもプラットフォームでもない。素の Hono の上に薄く載るだけで、アプリに載る依存は `hono` だけ（Node では cron のために `hono-kit-node` も）。ルーティングは [Void](https://void.cloud/guide/server-routing) の形を借りていて（`src/routes/` のディレクトリが URL）、hono-kit はその高さからビルド・デプロイ・インフラを抜いたもの。そのかわりに endpoint の書き方を型と lint で明示させる。

## 始め方

```sh
pnpm create hnk my-app
cd my-app && pnpm install
pnpm check
```

`pnpm create hnk` は雛形を聞いてくる。`workers`（Cloudflare Workers + D1）か `node`（Node + SQLite、libSQL）。`--template node` を付ければ聞かれない（`pnpm create hnk my-app --template node`）。

`pnpm check` は型検査・lint・format の確認・テストを回し、最後に失敗を一覧で出す。AI には「これを通して」と言えば足りる。

## 決まり

決まりはパッケージの中にあり、インストールした版と一緒に変わる。入口は `node_modules/hono-kit/docs/index.md`（[GitHub](packages/hono-kit/docs/index.md)）。生成したアプリの `AGENTS.md` は、そこを指しているだけ。

## 範囲

- Cloudflare Workers + D1 か Node + SQLite（libSQL）、どちらも Drizzle
- 検証は Standard Schema を満たすものなら何でも（zod で確かめた）
- 0.x。実プロダクトで使いながら形を変える

## License

MIT
