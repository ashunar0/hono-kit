# hono-kit

[English](README.md)

Hono で書くときの「置き場所」と「部品の形」を決める規約と、その生成器・lint。
誰が書いても（AI が書いても）同じ形になることを狙っている。

> 非公式。Hono チームとは関係ない。

AI にバックエンドを書かせると、置き場所・失敗の返し方・権限の確かめ方が毎回少しずつ揺れる。
hono-kit は形を先に決め、外れたものを型と lint で止める。lint の指摘には直し方を書いてあるので、AI が自分で気づいて直せる。

フレームワークでもプラットフォームでもない。素の Hono の上に薄く載るだけで、hono-kit 自身の依存は `hono` だけ。

## 始め方

```sh
pnpm create hnk my-app
cd my-app && pnpm install
pnpm hnk g domain posts
pnpm db:generate && pnpm check
```

`pnpm check` は型検査・lint・format の確認・テストを順に回し、途中で落ちても止めずに最後に失敗を一覧で出す。AI には「これを通して」と言う 1 つのコマンド。

生成したアプリには `AGENTS.md`（と、それを読み込むだけの `CLAUDE.md`）が入る。コマンド・形・守ることを短くまとめたもの。必要なときだけ読む長めの手順は、パッケージの中（`node_modules/hono-kit/docs/`）にある。

## 中身

```
packages/hono-kit/     本体。仕組み（Result、createRouter、createWorker など）、lint のルール、生成器（hnk）、雛形
packages/create-hnk/   pnpm create hnk の入口
examples/invoices/     規約どおりに書いた例のアプリ（Hono + Cloudflare Workers + D1）
```

例のアプリは invoices（請求書）を中心に、domain をまたぐ支払い・cron・queue・webhook・組織と共有まで入っている。以下のコード例はそこから取っている。

## hono-kit を使うとこう書く

```ts
// src/routes/invoices/index.ts
export const invoicesRouter = createRouter()
  // 更新
  .endpoint(
    {
      method: "put",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema, json: invoiceInputSchema },
      responses: {
        200: invoiceResponseSchema,
        ...errorResponses(NotFound, Forbidden),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const now = c.get("now");

      const result = await invoices.update(actor, id, input, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, invoiceResponse(result.value));
    },
  );
```

- `responses` がそのエンドポイントの約束。handler は `reply` で返し、約束とずれると、間違えた値そのものに赤線が付く
- `requireAuth` が返しうる 401 と、入力の検査の 400 は自動で宣言される。書くのはドメインの失敗だけ
- handler の引数は「受け取る（`c`）・返す（`reply`）・使う（依存）」の順
- 誰として（`actor`）は guard が決め、いつ（`now`）は handler が決める。service はどちらも引数で受け取る

```ts
// src/domains/invoices/service.ts
async update(actor: Actor, id: InvoiceId, input: InvoiceInput, now: Date): Promise<Result<Invoice, typeof NotFound.code | typeof Forbidden.code>> {
  const reach = reachOf(actor);

  const found = await repo.find(reach, id);
  if (found === null) return err(NotFound.code);
  if (!canEdit(found.access)) return err(Forbidden.code);

  const invoice = await repo.update(reach, id, { ...input, updatedAt: now });
  if (invoice === null) return err(NotFound.code);

  return ok(invoice);
}
```

- 引数は「誰として（actor）→ 何を → どうする → いつ（now）」の順。service は時計を読まない
- 想定内の失敗は Result で返す。service は HTTP のステータスを知らない
- 所有者の条件は repo の WHERE に入れて 1 文で書く。他人のものは在ることも知らせず NOT_FOUND
- `Invoice` は model が宣言するモノの型。repo は DB の行をこれに詰め替えて返す

## 出発点と育ち方

### 2 つの軸: リソースと domain

URL の名詞（リソース）と、ドメインの名詞（domain）は別物なので、置き場所を分ける。

- **リソース**（`src/routes/<名詞>/`）: クライアントが何を指すか。URL で切る。名詞ごとに必ずディレクトリを作り、中は `index.ts`（router）と `response.ts`（HTTP での見せ方）と `queries.<技術>.ts`（GET の読み取り）、要るときだけ `errors.ts`（その入口だけの失敗）。入れ子のリソースは入れ子のディレクトリ（`/invoices/:id/shares` → `routes/invoices/shares/`）。`:id` のディレクトリは作らない。親が子を `.route("/:id/shares", invoiceSharesRouter)` でマウントし、子の path は残りだけ
- **domain**（`src/domains/<名前>/`）: 誰がどのルールを守るか。ドメインで切る
- **jobs**（`src/jobs/<名前>.ts`）: HTTP 以外の入口（cron、キュー）。リソースが URL で名前を付けるのと同じく、きっかけで名前を付ける（`daily.ts`、`reminders-queue.ts`）。同じきっかけで動く仕事は同じファイルに並べる。domain の外に置き、service は deps から受け取る
- **参照は入口（routes、jobs）→ domains の一方向だけ**。route は必要なだけ domain を使ってよい。domain どうしは呼び合わない

同じ単語になることは多いが（`routes/invoices/` と `domains/invoices/`）、ならないこともある（`/payments` は支払いの domain と請求書の domain を両方使う）。片方に合わせて曲げない。
route を domain ごとに置くと、`/stores/:storeId/menus` と `/menus/:menuId` のように始まりの名詞が違うパスが 1 つの router に混ざり、Hono の入れ子が使えなくなる。他の domain を使うたびに、宣言して deps.ts でつなぐ例外も増える。それが分けた理由
jobs を domain の中に置かないのも同じ理由。cron やキューの入口は、きっかけで名前が付き、service を呼ぶ側なので、domain より routes の仲間。中身が 1 つの domain しか使わなくても、名前が一致するのはたまたまで、まとめる理由にならない

### 読み取りと書き込み

道は 2 本ある。

```
書き込み（POST・PATCH・DELETE）: route → service → model → repo   ルールを守る
読み取り（GET）:                  route → queries → 〜Within         範囲を守る
```

GET が返す形はリソースの都合なので、読み取りはリソースの隣の `queries.<技術>.ts` に書く（CQRS の、コードと型だけを分ける段階）。
queries は SELECT だけの db（`ReadDb`）を受け取り、持ち主の窓口（`〜Within(db, actor)`）を通して画面の 1 行を返す。表は直接読めないので、範囲の付け忘れが書けない。ルールは作らず、要るときは model から借りる。
書き込みの handler が入口の確認や材料のために読むときは、service を通す。ルールのための読み取り（貸せるかどうか数える）は domain の repo に残す。
画面のための読み取りを domain に置くと、一覧ごとに「どの domain が答えるか」を決める決まり（外部キーの向き、読む側が返す形の宣言、1 つの一覧を 2 通りに割らない）が要った。それが分けた理由
例のアプリの月ごとのレポートは、もとは自分の表もルールも持たない、読むだけの domain（reports）だった。queries に移すと domain ごと無くなった（集計は `routes/reports/queries.d1.ts`、admin だけが見られるのは guard の `requireRole("admin")`、月の計算は `src/lib/month.ts`）

### 出発点: core・inbound・outbound

domain は 3 つの側からなる。ヘキサゴナルアーキテクチャの分け方と同じ。

| 側           | 何か                                                 | 今あるファイル               |
| ------------ | ---------------------------------------------------- | ---------------------------- |
| **core**     | そのモノが何で、何ができるか。外を何も知らない       | model, service               |
| **inbound**  | 外から呼ばれる側。誰として呼ぶかを決めて core に渡す | リソース（src/routes）, jobs |
| **outbound** | 外へ出ていく側。core が宣言した形を満たす            | repo, gateway, mailer, queue |

出発点は、domain の 3 ファイルと、同じ名詞のリソース。core は What（model）と How（service）に分けて始める。手順はどの domain にも毎回あるので、最初から分けておく。

```
src/domains/invoices/
├─ model.ts      core（What）: 型・ルール（検査済みの印付き）。外を何も知らない
├─ service.ts     core（How）: 手順と、手順が必要とする outbound の形の宣言
└─ repo.d1.ts     outbound: テーブルと、D1 での実装。行 → モノの詰め替え
src/routes/invoices/
├─ index.ts       inbound: router。HTTP の入力の形と handler
├─ response.ts    inbound: モノを HTTP でどう見せるか（モノのルールではないので、リソースの側）
└─ queries.d1.ts  inbound: GET の読み取り。窓口（〜Within）を通して画面の 1 行を返す
```

```
  src/routes ──→ model ←────── repo.d1
       │           ↑               │
       └─(deps)──→ service ←───────┘ （service が宣言した形を、型だけ借りて満たす）
```

ルールは 1 つ。**矢印は全部 core に向かう**。inbound は service を import せず、deps から受け取る。
outbound のファイル名には、何に繋ぐかを書く（`repo.d1.ts`、`gateway.stripe.ts`）。

### 育ち方: 2 つ目が現れたときだけ、3 種類

| 動き         | きっかけ                                           | 足すもの                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 横に増える   | 2 つ目の inbound（cron、キュー）                   | domain の外の `src/jobs/<名前>.ts`。webhook は HTTP なのでリソース（`src/routes/webhooks/stripe/`）                                                                                                           |
| 横に増える   | 2 つ目の outbound（保存先、外部 API、メール）      | `files.r2.ts`、`gateway.stripe.ts` など。必要な形は service で宣言する                                                                                                                                        |
| 中で割れる   | 1 つのファイルが 2 つ目の理由で変わり始めた        | 同じ箱の中で分ける（service.ts → ports.ts など）。矢印は変わらない                                                                                                                                            |
| 中で割れる   | その domain だけの失敗（`NOT_DRAFT` など）が現れた | 足さない。model.ts に `Failure`（コード・種類・文言）を置く。番号は種類から hono-kit が決める。入口だけの失敗（webhook の署名など）は入口の隣の `src/routes/<名詞>/errors.ts`。domain に errors.ts は置かない |
| 窓口を開く   | 画面や他の domain が SQL で読みに来る（集計など）  | 持ち主の repo に `〜Within(db, actor)`。読む側は表を直接読まず、範囲の決め方も知らない                                                                                                                        |
| （足さない） | 他の domain を読む・書く                           | domain には何も足さない。入口（handler、cron、queue）が両方の service を呼び、値で渡す                                                                                                                        |

どの動きでも、矢印は model に向かったまま変わらない。

### domain をまたぐとき

domain は互いを呼ばない。つなぐのは入口（handler、cron、queue）で、deps.ts は domain を 1 行ずつ組み立てるだけ（domain の間に何もつながない）。

- **読みは何本でも**。handler は deps から必要なだけ service を受け取る（`{ invoices, payments }`）。URL の ID が実在しなければ、handler がその場で 404 を返す。同じ 2 行が並んでも middleware にまとめない（Go の `if err != nil` と同じく、明示する）
- **利用者の HTTP の書き込みは、1 つの service の 1 回の呼び出しだけ**。再送が無いので、2 つ続けて書くと 2 つ目で落ちたときに 1 つ目だけ残る。一緒に書くものは、その 1 回の中で 1 つの batch にする。
  handler は読んだものを値で渡し、書く service が「噛み合っているか」を確かめてから判断する。cron から呼んでも要るルール（行を見る権限、モノをまたぐ決まり）は service に残す。役割だけで決まる権限（司書だけが本を登録できる）は endpoint の guard（`requireRole`）に書く。
  ずれていたら、クライアントが選んだ値なら失敗を返し、handler が DB から読んだ値ならバグとして throw する
- **他の domain に波及させたいこと**（予約したら通知、など）は、相手の表に書かず、2 つ目の書き込みもしない。自分の表（outbox）に同じ batch で記録し、cron やキューで後から配る
- **再送のある入口（webhook・queue・cron）は、何回走っても同じ結果になる書き込みなら、複数の domain に順に書いてよい**。途中で落ちても再送でやり直せるから。済んだ印は最後に書く。
  今は Stripe の webhook が、支払いを記録してから（`payments.receive`）、請求書を支払い済みにしている（`invoices.markPaid`、送付済みからだけ動く）。
  システムにだけさせたい操作は、引数に `System` を取る（`markPaid(system, id, now)`）。`requireAuth` の handler は `User` しか持たないので呼べない

詳しくは [cross-domain.md](packages/hono-kit/docs/cross-domain.md)。

## 考え方

- **目指す先は Go**。同じ API を Go の定番の書き方でも書いて、並べて比べながら形を決めた（経緯は [hnk-next](https://github.com/ashunar0/hnk-next)）。
  AI は毎回ゼロから読むので、揃っていることが一番効く。書く量は AI が書くので気にしない。
  Rails の「書く量を減らす」は、人間の時間が足りなかった時代の答え
- **Go でも、慣習の多くはお願い**。会社のコードが揃うのは言語のおかげというより、
  スキーマからの生成・依存の向きの lint・書き方の lint・共通部品・文書（＋DB の制約）を重ねているから。どれも TS でできる
- **Go はディレクトリ構成を決めていない**。置き場所を決めるのは Rails のやり方。
  hono-kit は「置き場所は Rails のように決め、中身は Go のように明示的に書く」
- **作るヘルパーの基準**: 「それが無いと、どんな間違いが書けてしまうか」を言えるものだけ作る。見た目を変えるだけのものは作らない
- **簡潔さの基準**: 「概念を減らす簡潔」は取る（覚えることが少ない、場所が少ない、同じ言葉が層をまたいで使える）。
  「文字を減らす簡潔」（型の技や言語の小技で打つ量を減らす）は、形が違う所を 1 か所でも作って整列を崩すなら捨てる。
  短さが書き間違いを減らしている場合は、文字を減らすだけの技とは分けて、実験で比べてから決める

## 決めたこと

- **仕組みはパッケージ `hono-kit` として提供する**。アプリの決めごと（失敗の一覧、env、組み立て、middleware）と domain はアプリに置く。
  結びつけのためだけのファイルは作らない（`new Hono()` と同じく、使う場所で 1 行）
- **呼び出し側が別の道に進める失敗は Result、進めない失敗は throw**。再試行・案内・代替ができるもの
  （見つからない、権限が無い、決済サービスやメールが答えない）は Result で返す。DB が落ちたなど、どうしようもないものは throw。
  HTTP の入口の失敗（未ログイン、入力の形）も throw して onError に任せる。どの失敗がありうるかが型に出るのは、Go の `error` より強い
- **外への副作用は「先に記録 → 外へ → 結果で確定」**。外に出る前に記録があるので、何が起きたかを後から辿れる。
  外が冪等キーを受けるなら渡す（Stripe には paymentId、Resend には督促の日付入りのキー）。
  途中で落ちたときに「重複してもよい」か「欠けてもよい」かは業務の判断なので、service のコメントに書く
- **domain は互いを呼ばない**。つなぐのは入口（上の「domain をまたぐとき」）。deps.ts は domain を 1 行ずつ組み立てるだけで、domain の間に何もつながない。
  型の上でだけ、他の domain の model の型を借りてよい（`import type`）。外部キーの `references()` と、読ませる窓口（`〜Within`）は repo と queries の話で、下の「読みの窓口」にある。
  getter で遅延する案は外した（組み立ては関数を返すだけで軽い）。deps.ts は何を import してもよい場所で、lint の表には入れていない
- **route は `router.endpoint(設定, handler)` 1 つで書く**（素の Hono の上）。設定の `request` のキーは、handler で読む `c.req.valid("…")` の名前と同じ（`param` を宣言したら `valid("param")`）。`method` は小文字、`path` は Hono の `/:id`、応答はスキーマをそのまま書く（書き方は 1 つ。失敗の応答だけは `errorResponses` が失敗の文言を説明として付ける）。guard が持つ失敗と ValidationError を hono-kit が足す。`c.json` だとずれたときの赤線が handler の頭に付くので、`reply` で返す。`createRoute` は公開しない（書き方を 1 つにするため）。`path` の `:name` が `request.param` のキーに無いと型エラーになる（逆向きの余分なキーは許す。入れ子でマウントしたとき、親のパスの `:name` が来るから）
- **スキーマは Standard Schema を満たすものなら何でも**（zod、valibot で確かめた）。hono-kit は検証のライブラリを決め打ちせず、**hono-kit 自身の依存は hono だけ**。hono-kit が持つスキーマ（失敗の本文、ページ送り）は Standard Schema を手で満たして書いている。依存と `as never` の場所は `packages/hono-kit/test/source.test.mjs` が確かめる。**OpenAPI は別の部品**（`hono-kit/openapi` の `openapiDocument(app, info)`）で、登録された宣言から文書を作る。JSON Schema への変換はスキーマのライブラリ自身が持つ（Standard JSON Schema）。valibot は単体では出せないので、文書に出したいものだけ `toStandardJsonSchema` で包む。要らないなら使わない
- **失敗は値で、番号と文言を持つ**（`httpError("NOT_FOUND", 404, "…")`）。モノの失敗は model に `Failure`（`{ code, kind, message }`、HTTP を知らない）として置き、種類（`conflict` など）から番号を決める表は hono-kit が 1 か所で持つ（Go の errors.go、gRPC のステータスコードと同じ考え方）。`errorResponses` は `Failure` も `httpError` も受け取る。guard が持つ失敗と ValidationError は自動で宣言する。
  `reply.failure` が受け取れるのは、route に手で書いたドメインの失敗だけ。同じ番号の失敗が複数あっても 1 つの応答にまとめ、コードごとの文言で返す
- **誰として操作するかは `Actor`（利用者かシステム）で、引数の先頭に置く**（Go の `ctx` と同じ位置）。
  HTTP では guard が `c.get("actor")` に決め（`requireAuth` なら `User`、`allowSystem` ならシステム）、cron とキューでは `createWorker` が渡す。
  入口に関わらず、handler・cron・queue が読む名前は `actor` 1 つ。セッションの `user`（未ログインは null）は guard だけが読む
- **時計を読むのはアプリを組み立てる所だけ**。HTTP は `buildApp` が 1 リクエストに 1 回だけ読んで `c.get("now")` に積み、handler はそれを使う。cron は予定の時刻、queue は積まれた時刻を `now` として受け取る。service・repo は `now` を引数で受け取る（lint `no-clock-outside-app-entry`）。
  テストは `request(user, method, path, body, at)` で時刻を固定できる。同じ手順がどの入口から呼ばれても、入口の時計で動く。
  モノの時刻（`createdAt`・`updatedAt`）も `now` から入れる。DB の既定値は、model に出ない列の記録だけに使う
- **利用者とシステムには印を付ける**（`unique symbol`）。`{ kind: "system" }` のようなリテラルでは書けず、利用者を作れるのは `authenticatedUser` だけ。システムの型と値は hono-kit が持ち、アプリは作れず受け取るだけ（下の「HTTP 以外の入口」）
- **domain は model / service / repo.<技術> で始め、2 つ目が現れたときだけ育てる**（上の「出発点と育ち方」）。HTTP の入口は domain の外のリソース（`src/routes/`）。
  名前は domains。URL で切る routes と並べて、もう 1 つの軸がドメインだと名前で分かるようにする（以前は modules）。中のモノとルールのファイルは、まとまりの名前とぶつからないよう model.ts にする。features は「機能」で、複数のモノにまたがる操作の言葉なので使わない
- **model は外を知らない**。import できるのは zod と `src/lib/` だけ。ルールは zod で書き、フロントとも共有する。手順（How）は service に分ける
- **業務を知らないものは `src/lib/` に置く**（日付、時刻、タイムゾーンの変換）。見分け方は「別のアプリにそのまま持っていけるか」で、スタッフの立場は staff のもの（コピーするか型を借りる）、暦の上の日付はどのアプリでも同じ（lib）。どこからでも値で import でき、lib 自身は zod と他の lib しか import しない。だから lib を通して domain どうしがつながることはない。ファイルは中身で名前を付け（`time.ts`）、`utils.ts` は作らない。salon で、タイムゾーンの変換が shifts と予約の domain に 2 つコピーされたことから足した
- **ID には印を付ける**（`InvoiceId` / `UserId` / `OrgId`。`string & { [brand]: true }`）。印を付けてよいのは、その domain の model が出す作る関数（`invoiceId(value)`）だけで、他の場所の `as XxxId` は lint `no-id-cast` が止める。素の `string` や別の ID は渡せない。domain の中では、他の domain の ID は素の `string`（`Payment.invoiceId`）。印を付けるのは入口で、リソースはどの domain の model も使えるので、持ち主の `…IdSchema` で受け取る（`invoiceIdSchema`）。cron・queue も他の domain の model の値を使えるので、`invoiceId(body.invoiceId)` を付けて渡す
- **入力は検査済みの印（zod の brand）付きでしか service に渡せない**。どの入口から呼んでも、検査を飛ばすと型エラーになる
- **service は hono を知らない**。hono-kit から使うのは `hono-kit/result` だけ
- **依存は `buildApp(makeDeps)`**。Workers はリクエストをまたいだ I/O を拒むので、組み立てた結果ではなく組み立て方を渡す。
  `provideDeps` がリクエストごとに、使うときに 1 回だけ組み立てる
- **outbound の形は service が宣言する**（Go の「interface は使う側が決める」）
- **lint は `hono-kit/lint` で提供する**。domain の中のファイルは、名前の頭（役割）で core / inbound / outbound に分ける。`src/routes/` の中は `index.ts`（resource）と `response.ts`（response）と `errors.ts`（errors）と `queries.<技術>.ts`（queries）だけ。
  役割の分からないファイルは置けない。依存の向きは役割ごとの許可表（`layer-imports`）で守らせ、表に無い import は全部だめ。
  相対 import も tsconfig の paths 経由も同じに見る。HTTP の入口（`src/routes/` の `index.ts`）には、 `.endpoint` に認証の指定、`c.json` 禁止、を求める。domain から `src/routes/` は import できない。どこでも、モジュールの一番上に変わる状態を置かない。
  他 domain の表を直接読まない（`no-foreign-table-reads`）、ID の印を `as` で付けない（`no-id-cast`）、アプリを組み立てる所の外で時計を読まない（`no-clock-outside-app-entry`）、上限の無い一覧を書かない（`route-lists-are-paged`）、成功に 200 以外を使わない（`route-responds-200`）、`new Hono()` を書かない（`no-new-hono`）も、lint で止める

役割ごとに import してよい相手の表は、英語の [README の「Who may import what」](README.md#who-may-import-what) にある（`packages/hono-kit/lint/layers.mjs` から生成）。

- **名前は Hono に合わせて `create〜`**。束は `invoicesRouter`
- **一覧のページ送りは hono-kit の部品**（`hono-kit/page` と `pageQuerySchema` / `pageResponseSchema` / `pageResponse`）。
  `pageQuerySchema(絞り込みのスキーマ)` が cursor と limit を足し、`pageResponseSchema(1 件のスキーマ)` が `{ items, nextCursor }` を作る。中身はアプリのスキーマ（zod でも valibot でも）。
  一覧は `PageQuery`（`limit` は必須）を受け取って `Page` を返す。query に展開すると `limit` に既定（20）と上限（100）が付く。
  queries は `limit + 1` 件読んで `toPage` に渡す。一覧の route（`get` で、path の最後が `:param` でないもの）の query が `pageQuerySchema(...)` の呼び出し（か、同じファイルでそれを入れた変数）でないと、lint `route-lists-are-paged` が止める。件数が別の所で決まっているもの（月ごとの集計は `MAX_MONTHS` で検査している）は、`// oxlint-disable-next-line hnk/route-lists-are-paged -- 理由` で外す。**試しに強く付けてある**。例外で困る場面が多ければ、このルールを外す
- **ログイン状態は `buildApp(makeDeps, authenticate)` で差し込む**。`authenticate` はセッションの user（未ログインは null）を文脈に積む middleware で、
  本番は `withUser`（認証の提供元ができるまでは仮実装）、テストは `appAs(user)`（`test/fixtures.ts`）で本物の deps と D1 のまま利用者だけ差し替える。
  route 層は HTTP 越しに試せる。置き場所はテスト相手の隣（`src/routes/invoices/index.test.ts`）。model と service のテストは domain に残す（Go の _test.go と同じ）
- **HTTP 以外の入口は `createWorker` に渡す**（`index.ts` に 1 つ）。deps は呼び出しごとに 1 回組み立て、`actor`（システム）と `now` を渡す。
  `now` は scheduled なら予定の時刻、queue ならメッセージが積まれた時刻（再送が日をまたいでも同じ日の督促になる）。
  queue の handler は Result を返すだけ: ok で ack、err で retry、想定外の throw はそのメッセージだけ retry にして同じバッチの残りは続ける。
  `src/jobs/` のファイルはシステムを import せず受け取るだけ。システムの値を作る場所は hono-kit の中に 1 つ（テストは `hono-kit/testing`）。
  署名つき webhook はリソース（`src/routes/webhooks/stripe/`）で、`allowSystem` を宣言して `c.get("actor")` で受け取る（署名を確かめた後に使う）
- **組織は User が持ち、範囲（Reach）がデータで運ぶ**。システムは全組織、admin は自分の組織の全員分、member は自分の分だけ。
  どの範囲も組織の線を越えない
- **共有は同じ組織の中で、閲覧と編集の 2 段階**。member の範囲は「自分のもの＋共有されたもの」。
  repo が範囲を解釈し、行と一緒に access（`manage` / `edit` / `view`）を返す。`canEdit` と `canManage` は access を受け取る純関数。
  共有できるのは所有者と組織の admin。見えない人には在ることも分からない（NOT_FOUND）、見えるが権限が足りないときは FORBIDDEN
- **repo の外への窓口は 1 つだけ**: SQL で読ませる、持ち主の repo が出す `〜Within`（outbound）。
  repo と queries は他 domain の repo から、外部キーの表（`〜Table`）と `〜Within` だけを借りる（lint `layer-imports`）。service どうしは呼び合わず、入口がつなぐ
- **domain の外（queries と他の domain）に見せる読みは、誰として読むかが必須の入口（`invoicesWithin(db, actor)` など）だけ**。actor が必須引数なので、範囲の付け忘れが書けない。
  範囲の決め方（`reachOf`）は持ち主の中に閉じていて、読む側は知らない。範囲が他の domain を通して決まるとき（会員の「自分の貸出」は、見える会員行の貸出）は、reach が actor を持ち、`within` がそれを相手の窓口に渡す。
  誰が見ても同じ数（本の残り冊数）は、actor を取らない窓口（`onLoanByBookWithin(db)`）を持ち主が出す。「貸出中」の意味が持ち主の中に残る。
  生の表は読みに使わせない（lint `no-foreign-table-reads`。外部キーの `references()` の中だけ許す）。
  `〜Within` は repo の export から自動で拾い、`test/reads-contract.test.ts` が「他の組織のデータが出ない」を全部に当てる。
  読みを足したら、その表の行を seed に足さないとテストが落ちる
- **読みの線引き**: 状態の意味や業務のルールが入るもの（期限切れ、請求済みなど）は持ち主が答える（`isRemindable`、`billedStatuses`）。
  形を変えるだけの集計（月ごとにまとめる）は読み側（queries）が、範囲付きの入口から書く。ここは機械で止められないので、レビューで見る

## 新しい土台・新しい domain を出す

形は生成器が出す。自分で層を考えない。

```sh
pnpm create hnk <dir>                  # 土台（users・db・deps・middleware・check・lint 設定・vitest）
pnpm hnk g domain <複数形の camelCase> # 例: invoices, signupRequests。src/domains/<名前>/ の骨組みを出し、deps.ts の `// hnk:` の行につなぐ
```

出るのは id と日時だけを持つモノと、`get` / `create` だけの骨組み。誰が操作するか（actor）も知らないので、users の形を変えたアプリでもそのまま型が通る。これを本物のモノに育てて、`pnpm db:generate`、`pnpm exec prettier --write .`、`pnpm check` の順に回す。
リソース（`src/routes/<名詞>/`）は生成しない。中身はどの domain を使うかで毎回違い、つなぐ先も親のリソースだったりするので、URL を見て手で書く。
CLI の元は `packages/hono-kit/bin/hnk.mjs`、雛形は `packages/hono-kit/templates/`。雛形が今も `pnpm check` を通ることは `pnpm -C packages/hono-kit e2e`（npm に出す tgz で通すなら `e2e:packed`）で確かめる。

## 新しい domain を足すとき

生成された形のまま、invoices と同じ形で書く。迷いやすい所は、次のとおりに揃える（comments を AI に書かせた実験で、書き手が迷った所）。

| 迷うこと                               | 決まり                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 置き場所                               | `domains/<名前>/` に `model / service / repo.d1` で始める（生成器）。リソースは URL のとおり `routes/<名詞>/` に `index.ts / response.ts / queries.d1.ts` を手で書く。増やすのは 2 つ目が現れたとき                                                                                                                                                           |
| 他の domain を使う                     | domain からは使わない。handler が両方の service を受け取り、読んだものを値で渡す。受け取る service は形を宣言する（使う分だけ。例: `{ id: string; storeId: string }`）                                                                                                                                                                                        |
| 他の domain の表                       | 外部キーの `references()` の中でだけ使う。読むときは、持ち主が出している `〜Within(db, actor)` を使う                                                                                                                                                                                                                                                         |
| 親の下にぶら下がるもの（コメントなど） | 親が見えるかを、GET なら親のリソースの queries に（`issueQueries.get(actor, issueId)`）、書き込みなら親の service に（`issues.get(actor, issueId)`）handler が問い合わせる（見えなければ NOT_FOUND）。子に orgId は持たせない。親が見えれば読める・書ける。もっと厳しい権限が要るなら、親が access を返す問いを宣言する                                       |
| 子の router                            | 入れ子のリソース（`routes/issues/comments/`）。親が `.route("/:issueId/comments", issueCommentsRouter)` でマウントし、子の path は残りだけ（`"/"`、`"/:id"`）。`request.param` には親の param も書く                                                                                                                                                          |
| 失敗の使い分け                         | 見えないものは `NOT_FOUND`（在ることも知らせない）、見えるが権限が足りないものは `FORBIDDEN`。確認の順は guard（401 → 役割の 403）→ 入力検査 400 → NOT_FOUND → FORBIDDEN（行を見る権限）→ unprocessable → conflict                                                                                                                                            |
| 状態が進むモノ                         | 遷移できない失敗は model に `kind: "conflict"` の `Failure`。遷移は `POST /:id/<動詞>`。repo に `status = from` を WHERE に入れた 1 文の更新を持たせ、確認の後に null なら同じ conflict を返す（`send` の形）。`NOT_PAYABLE` は invoices が返す失敗で、payments の model の `NotPayable` と同じ code                                                          |
| 状態コード                             | 作成は 200 で作ったものを返す。削除は `{ ok: true }` の 200                                                                                                                                                                                                                                                                                                   |
| 入力の文字列                           | `trim()` してから長さを数える。空白だけは通さない                                                                                                                                                                                                                                                                                                             |
| 一覧                                   | 必ず `pageQuerySchema` / `pageResponseSchema` / `pageResponse` を使う。queries は `PageQuery` を受け取って `Page` を返す（`toPage`）。上限の無い一覧を書かない。応答は `{ items, nextCursor }`（nextCursor は文字列。続きが無ければ null）。並びが昇順なら、cursor の比較は `gt`（invoices の降順は `lt`）。親が見えないときの一覧は `NOT_FOUND` を返してよい |
| 操作する人の型                         | 利用者のいない入口（cron、webhook）が呼ぶ service は `Actor` を受ける。利用者の操作だけの service は `User` を受けてよい（HTTP は `requireAuth` で `User` になる）。どちらも引数の先頭に置く                                                                                                                                                                  |
| 外部キーの onDelete                    | 親が消えたら子も消えるなら `cascade`。子が親より長く残るべきなら、理由を書いて別の値にする                                                                                                                                                                                                                                                                    |
| システム（cron、webhook）の権限        | 書く・消すのは利用者（`User`）だけ。システムにさせたい操作は、持ち主の service に `System` を受ける関数として出す（例: `markPaid(system, id, now)`）                                                                                                                                                                                                          |
| テスト                                 | HTTP のテストはリソースの隣（`src/routes/<名詞>/index.test.ts`）、model と service のテストは domain の中（`service.test.ts` など）。domain をまたぐ線（組織の線・読みの窓口）とアプリ全体は `test/`。本物のローカル D1 を使う。HTTP は `fixtures.ts` の `request(user, method, path, body)` で、利用者を差し替えて試す                                       |
| migration                              | `pnpm db:generate` で作る。`pnpm format` は `migrations/meta/*.json` を壊すので、migrations には掛けない                                                                                                                                                                                                                                                      |

## 未決

- 共有の相手が同じ組織かは確かめていない（利用者の一覧が無い）。違う組織でも、範囲が組織で絞るので見えないだけ
- 共有の取り消しと書き込みの間の競合: access を見てから書くまでの間に取り消されると、1 回は書ける（書き込みは組織の範囲に留まる）。
  SQL に access の判定を持たせるとルールが 2 か所になるので、model の 1 か所を取った
- 閲覧だけを共有された人も、支払いを始められる（`getPayable` は access を見ない）
- D1 には対話的なトランザクションが無い（`batch` が基本）。マルチテナントを考えるときに効く
- テストは、本物のローカル D1 を使い、HTTP のテストはリソースの隣、model と service のテストは domain の中に置くところまで決めた。service が返す失敗コードごとにテストがあるかを機械で見張るかは未定
- 設定の形（`request: { param, query, json }`、応答はスキーマそのまま）は、使ってみて揺れたら見直す。`reply(200, body)` を `reply.ok` / `reply.err` に揃えるかも、reply の使い間違いが実験で見えたら比べる
- 「育ち方」を lint と生成器にどこまで載せるか
- queue を複数持つときの振り分け、cron 式ごとの切り替え（今は 1 つずつ）
- この形で実プロダクトを書いてから、生成器とスキルに持ち帰る
