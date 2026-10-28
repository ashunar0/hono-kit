# 設計メモ

hono-kit を作る側のメモ。決めたことの理由と、まだ決めていないこと。アプリを書く人向けの決まりは [packages/hono-kit/docs/](packages/hono-kit/docs/index.md) にあり、ここには書かない。

## 考え方

- **目指す先は Go**。AI は毎回ゼロから読むので、揃っていることが一番効く。書く量は AI が書くので気にしない。Rails の「書く量を減らす」は、人間の時間が足りなかった時代の答え
- **Go でも、慣習の多くはお願い**。会社のコードが揃うのは言語のおかげというより、スキーマからの生成・依存の向きの lint・書き方の lint・共通部品・文書（＋DB の制約）を重ねているから。どれも TS でできる
- **Go はディレクトリ構成を決めていない**。hono-kit が決める置き場所は URL（`src/routes/`）だけで、その下は Go と同じくアプリに任せる。中身は Go のように明示的に書く
- **本体は HTTP の入口とその書き方だけ**。アーキテクチャ（domain・service・repo など）まで決めると、hono-kit は DB を持たないので、環境の都合が規約に漏れる（D1 に対話的なトランザクションが無いから読みに reader が要る、など）。アーキテクチャを決めた版は 0.8.0 まで
- **線引き**: 「Go にあるから入れる」ではなく、「Go で自然に手に入るもののうち、TS でもコストが小さいものだけ入れる」。実験で困った実例が無いものは足さない
- **作るヘルパーの基準**: 「それが無いと、どんな間違いが書けてしまうか」を言えるものだけ作る。見た目を変えるだけのものは作らない
- **簡潔さの基準**: 「概念を減らす簡潔」は取る（覚えることが少ない、場所が少ない、同じ言葉が層をまたいで使える）。「文字を減らす簡潔」（型の技や言語の小技で打つ量を減らす）は、形が違う所を 1 か所でも作って整列を崩すなら捨てる。短さが書き間違いを減らしている場合は、文字を減らすだけの技とは分けて、実験で比べてから決める
- **ルールとナレッジを分ける**。hono-kit が持つのは「別のやり方をすると hono-kit の形が崩れる」ものだけ。道具の知恵や設計の考え方（一覧に上限を付ける、など）は、正しい別のやり方がある場面もあるので、hono-kit の外に置く

## 決めたことの理由

- **仕組みはパッケージ、決めごとはアプリ**。失敗の一覧・deps の中身・認証のスタック・アプリの middleware はアプリに置く。どのアプリでも一字一句同じもの（`now` を置く・deps を載せる・`onError`・guard・型の登録）は hono-kit が持ち、アプリには書かせない。組み立ては Go の `main.go` と同じく `src/main.ts` 1 つで、そこに見えるのはアプリが選んだことだけ。`registerRoutes(app)` だけは同じ 1 行でも隠さない（Hono は登録した順に効くので、アプリの middleware をその前に書ける場所が要る）
- **ルーティングは Void の形を借りる**。違えているのは 3 つ: 成功は 200 だけ、依存は handler の 3 つ目の引数、1 つの URL に `index.ts` は 1 つ
- **endpoint はディレクトリで切る**。Hono の普通の書き方（リソースごとのファイルで `app.get(...)` をチェーンし、`app.route(...)` でつなぐ）と比べて、手に入るものが 3 つある。①置き場所を選ぶ場面がない（`/customers/:id/invoices` を `customers.ts` と `invoices.ts` のどちらに書くかで揺れない）②親のパスの param まで型で見られる（`app.route` でつないだ先の handler は、親の `:id` を型の上で知らない）③チェーンを守らなくても RPC の型が壊れない（AppType は生成器が endpoint を 1 本ずつ `&` で並べる）。handler に名前が要らないこと、型が軽くなること（大きいアプリでだけ効く）は理由にしない。`c.json` だとずれたときの赤線が handler の頭に付くので、`reply` で返す。書くのは `reply.success(body)` と `reply.failure(code)` だけで、どちらも番号を取らない（成功は 200 だけ、失敗は種類から決まる）。名前を success / failure にしたのは、`ok` だと `result.ok` と見た目が似すぎるのと、`error` だと throw する想定外のエラーとぶつかるから（決まった失敗は `Failure`）。`reply` を `success(c, body)` のような c を取る関数にせず handler の引数で渡すのは、Hono の `c` の型が `responses` を知らないから。約束を型で運べるのは、宣言を読んだ `createEndpoint` が作る `reply` だけ
- **誰が呼べるかは必須の `auth` 欄**。書き忘れと「わざと公開」を見分けるため（公開は `allowAnonymous` と書く）。前は `middleware` の中の名前（`require` / `allow` で始まる）を lint で見ていたが、名前の約束では中身を確かめられないので、型で止める形にした（tRPC の `publicProcedure` / `protectedProcedure` に近い）。型が見るのは「`currentUser` を置くか」で、何かを読み込むだけで誰も弾かない middleware は `auth` に書けない。公開の `allowAnonymous` も `currentUser: null` を置く。前は受付（`withAccount` がセッションを読んで `account` を置く）と門番（`actor` に写す）の 2 段で、名前を分けることで「`auth` に受付を書く」のを止めていた。セッションを読むのを deps の関数（`sessionUser`）にして門番が自分で呼ぶ形にしたので、受付が無くなり、名前は 1 つで同じ守りが残る（テストも `makeDeps` で `sessionUser` を差し替えるだけになった）。専用の関数（`defineAuth` のような印）は足さなかった。印は「auth として使う」と宣言するだけで、ここで決めている「`currentUser` を置く」を確かめないから。どちらの形でも、本当に人を弾くかまでは型で分からない。認証のスタックで変わるのはセッションの読み方だけで、それは deps の `sessionUser(headers)` に置く（`CurrentUser` の形もその戻り値から決まる）。だから `requireAuth`・`allowAnonymous` の中身はどのアプリでも同じになり、hono-kit が持つ。`CurrentUser` と `UserId` の印も hono-kit が付ける。`CurrentUser` を作れるのは `getCurrentUser(c)`（本物のセッションを読む）だけなので、手で作った object をサインインした人として渡せない。アプリが足す guard（`requireRole`）もこれを使う
- **状態の遷移は動詞のディレクトリ**（Google の AIP-136 や Stripe と同じ）。戻せない遷移（送付・支払い・取り消し）には合う名詞が無く、名前探しで AI が迷うから
- **import の外向きは `#src/`**。Node の標準の仕組み（package.json の `imports`）。tsconfig の paths だと vitest がそのままでは読めず、設定を 2 か所に書くか依存を足すことになる
- **登録と AppType は生成器が書き、`routes.gen.ts` は git に入れない**（Void の `.void/` と同じ。install・dev・check のたびに書くので古いまま残らず、古いかを比べる仕組みが要らない）。AppType はチェーンせず、endpoint を 1 本ずつ `&` で並べる。export は oxc-parser で読み、読めないファイルは黙って抜かさず、理由を出して止まる
- **依存は hono だけ**。スキーマは Standard Schema を満たすものなら何でもよく、hono-kit が持つスキーマ（失敗の本文、ページ送り）は Standard Schema を手で満たして書く。例外は `hono-kit/sqlite` だけで、drizzle を peer dependency にしてアプリの drizzle を借りる（同梱はしない。drizzle を抱えるかは未決）。楽観ロックの道具（`updateWithVersion`）は drizzle に無く、手で書くと version の足し忘れや 0 行の見落としが静かに通るので、ここに置く。トランザクションは包まない（pg の transaction と D1 の batch は形そのものが違い、包むと違いが隠れる）。依存と `as never` の場所は `packages/hono-kit/test/source.test.mjs` が確かめる。OpenAPI は別の部品で、JSON Schema への変換はスキーマのライブラリ自身に任せる（Standard JSON Schema）
- **失敗は Result、どうしようもないものは throw**。どの失敗がありうるかが型に出るのは、Go の `error` より強い。番号を種類から決める表を hono-kit が 1 か所で持つのは、Go の errors.go や gRPC のステータスコードと同じ考え方
- **依存は `createApp({ makeDeps })`**。Workers はリクエストをまたいだ I/O を拒むので、組み立てた結果ではなく組み立て方を渡す。要るのは実行環境とテスト（偽物を渡す）のためで、アーキテクチャのためではない。deps と bindings の型は、`hnk prepare` が `src/main.ts` の `makeDeps` から `Register` に書く
- **名前は `create〜`**。Hono v5 は `define〜` に移るので、ぶつからない。endpoint は `createEndpoint`（hono-kit では route をリソースの意味で使うので、`createRoute` にはしない）
- **一覧の上限は lint で求めない**。上限を付けるかは運用の判断で、付けなくても hono-kit の形は崩れない。1 つしか無いリソース（`/me/profile`）や、件数が別の所で決まる集計で、lint を黙らせる行が要る場面が続いた

## 未決

- 設定の形（`request: { param, query, json }`、応答はスキーマそのまま）は、使ってみて揺れたら見直す
- アーキテクチャ（0.8.0 まであった domain・service・queries の規約）の行き先。別のプリセットにするか、捨てるか
- `Result` を受け取らずに捨てたら止める lint（Go の errcheck にあたるもの）。実験ではまだ起きていないので、起きたら足す
- この形で実プロダクトを書いてから、生成器とスキルに持ち帰る
