# 設計メモ

hono-kit を作る側のメモ。決めたことの理由と、まだ決めていないこと。アプリを書く人向けの決まりは [packages/hono-kit/docs/](packages/hono-kit/docs/index.md) にあり、ここには書かない。例のアプリの業務は [examples/invoices](examples/invoices/README.md) にある。

## 考え方

- **目指す先は Go**。AI は毎回ゼロから読むので、揃っていることが一番効く。書く量は AI が書くので気にしない。Rails の「書く量を減らす」は、人間の時間が足りなかった時代の答え
- **Go でも、慣習の多くはお願い**。会社のコードが揃うのは言語のおかげというより、スキーマからの生成・依存の向きの lint・書き方の lint・共通部品・文書（＋DB の制約）を重ねているから。どれも TS でできる
- **Go はディレクトリ構成を決めていない**。置き場所を決めるのは Rails のやり方。hono-kit は「置き場所は Rails のように決め、中身は Go のように明示的に書く」
- **作るヘルパーの基準**: 「それが無いと、どんな間違いが書けてしまうか」を言えるものだけ作る。見た目を変えるだけのものは作らない
- **簡潔さの基準**: 「概念を減らす簡潔」は取る（覚えることが少ない、場所が少ない、同じ言葉が層をまたいで使える）。「文字を減らす簡潔」（型の技や言語の小技で打つ量を減らす）は、形が違う所を 1 か所でも作って整列を崩すなら捨てる。短さが書き間違いを減らしている場合は、文字を減らすだけの技とは分けて、実験で比べてから決める
- **ルールとナレッジを分ける**。hono-kit が持つのは「別のやり方をすると hono-kit の形が崩れる」ものだけ。道具の知恵や設計の考え方（一覧に上限を付ける、など）は、正しい別のやり方がある場面もあるので、hono-kit の外に置く

## 決めたことの理由

- **仕組みはパッケージ、決めごとはアプリ**。失敗の一覧・env・組み立て・middleware と domain はアプリに置く。結びつけのためだけのファイルは作らない（`new Hono()` と同じく、使う場所で 1 行）
- **ルーティングは Void の形を借りる**。違えているのは 3 つ: 成功は 200 だけ、依存は handler の 3 つ目の引数、1 つの URL に `index.ts` は 1 つ
- **リソースと domain を分ける**。route を domain ごとに置くと、`/stores/:storeId/menus` と `/menus/:menuId` のように始まりの名詞が違うパスが 1 つの router に混ざり、Hono の入れ子が使えなくなる。他の domain を使うたびに、宣言して deps.ts でつなぐ例外も増える。jobs を domain の中に置かないのも同じ理由で、きっかけで名前が付き service を呼ぶ側なので routes の仲間
- **endpoint はディレクトリで切る**。書き味と、AI が置き場所を間違えにくいから（型が軽くなるのは大きいアプリでだけ効くので、理由にしない）。`c.json` だとずれたときの赤線が handler の頭に付くので、`reply` で返す
- **誰が呼べるかは必須の `auth` 欄**。書き忘れと「わざと公開」を見分けるため（公開は `allowAnonymous` と書く）。前は `middleware` の中の名前（`require` / `allow` で始まる）を lint で見ていたが、名前の約束では中身を確かめられないので、型で止める形にした（tRPC の `publicProcedure` / `protectedProcedure` に近い）。型が見るのは「`actor` を入れるか」で、`withAccount` のように `account` を積むだけの middleware は `auth` に書けない。公開の `allowAnonymous` も `actor: null` を入れる。専用の関数（`defineAuth` のような印）は足さなかった。印は「auth として使う」と宣言するだけで、ここで決めている「`actor` を入れる」を確かめないから。どちらの形でも、本当に人を弾くかまでは型で分からない。guard の中身（セッションの読み方、`Account` の形、どの guard があるか）は認証のスタックで変わるので、hono-kit は決めずアプリに置く。hono-kit が決めるのは「`auth` に 1 つ書く」と「それが `actor` を入れる」だけ
- **読みと書きは名前でなく置き場所で分ける**。service は `createService({ read, write })` で 2 つに分かれ、入口は `invoices.read.get(...)` / `invoices.write.send(...)` と側を選んで呼ぶ。`read` は各ポートの read の側（`repo.read`、gateway の `read`）しか受け取らず、mailer や queue のように書くだけのものは渡らないので、read に書き込みは書けない（型で止まる）。repo も `createRepository` で同じように分かれ、read の側は読みだけの db しか持たない。前は `get` / `list` で始まるかを lint で見ていたが、名前の約束では中身を確かめられない（`getOrCreate` を書けてしまい、`find` や `count` は書き込みに数えられる）。`auth` を名前から型に移したのと同じ理由。lint（`route-writes-once`）が数えるのは `.write.` の呼び出しだけになった。lint は型を見られないので、write を取り出して呼ぶ（`const { write } = invoices`）のは止める
- **状態の遷移は動詞のディレクトリ**（Google の AIP-136 や Stripe と同じ）。戻せない遷移（送付・支払い・取り消し）には合う名詞が無く、名前探しで AI が迷うから
- **import の外向きは `#src/`**。Node の標準の仕組み（package.json の `imports`）。tsconfig の paths だと vitest がそのままでは読めず、設定を 2 か所に書くか依存を足すことになる
- **登録と AppType は生成器が書き、`routes.gen.ts` は git に入れる**。AppType はチェーンせず、endpoint を 1 本ずつ `&` で並べる。export は oxc-parser で読み、読めないファイルは黙って抜かさず、理由を出して止まる
- **依存は hono だけ**。スキーマは Standard Schema を満たすものなら何でもよく、hono-kit が持つスキーマ（失敗の本文、ページ送り）は Standard Schema を手で満たして書く。依存と `as never` の場所は `packages/hono-kit/test/source.test.mjs` が確かめる。OpenAPI は別の部品で、JSON Schema への変換はスキーマのライブラリ自身に任せる（Standard JSON Schema）
- **失敗は Result、どうしようもないものは throw**。どの失敗がありうるかが型に出るのは、Go の `error` より強い。番号を種類から決める表を hono-kit が 1 か所で持つのは、Go の errors.go や gRPC のステータスコードと同じ考え方
- **`actor` は引数の先頭**（Go の `ctx` と同じ位置）。利用者とシステムには `unique symbol` の印を付け、リテラルでは書けないようにする
- **名前は domains と model.ts**。URL で切る routes と並べて、もう 1 つの軸がドメインだと名前で分かるようにする。中のファイルは、まとまりの名前とぶつからないよう model.ts。features は「機能」で、複数のモノにまたがる操作の言葉なので使わない
- **model のルールは zod で書く**。フロントとも共有できるから
- **依存は `buildApp(makeDeps)`**。Workers はリクエストをまたいだ I/O を拒むので、組み立てた結果ではなく組み立て方を渡す
- **アダプターの形は service が宣言する**（Go の「interface は使う側が決める」）
- **名前は `create〜`**。Hono v5 は `define〜` に移るので、ぶつからない。endpoint は `createEndpoint`（hono-kit では route をリソースの意味で使うので、`createRoute` にはしない）
- **一覧の上限は lint で求めない**。上限を付けるかは運用の判断で、付けなくても hono-kit の形は崩れない。1 つしか無いリソース（`/me/profile`）や、件数が別の所で決まる集計で、lint を黙らせる行が要る場面が続いた
- **読みの線引きは機械で止められない**。状態の意味や業務のルールが入るもの（期限切れ、請求済み）は持ち主が答え、形を変えるだけの集計は queries が書く。ここはレビューで見る

## 未決

- service が返す失敗コードごとにテストがあるかを、機械で見張るか
- 設定の形（`request: { param, query, json }`、応答はスキーマそのまま）は、使ってみて揺れたら見直す。`reply(200, body)` を `reply.ok` / `reply.err` に揃えるかも、reply の使い間違いが実験で見えたら比べる
- 「育ち方」を lint と生成器にどこまで載せるか
- queue を複数持つときの振り分け、cron 式ごとの切り替え（今は 1 つずつ）
- D1 には対話的なトランザクションが無い（`batch` が基本）。マルチテナントを考えるときに効く
- この形で実プロダクトを書いてから、生成器とスキルに持ち帰る
