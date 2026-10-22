/**
 * アダプター: service が宣言した形を満たし、外（DB、外部 API、メール、キュー）に繋ぐ役割。
 * ファイル名は「役割.技術.ts」（repo.d1.ts、gateway.stripe.ts）
 */
export const ADAPTER_ROLES = ["repo", "gateway", "mailer", "queue"];

/**
 * domain の中に置ける役割。
 * ここに無い名前のファイルは domain の中に置けない（layer-imports が止める）
 */
export const DOMAIN_ROLES = ["model", "service", ...ADAPTER_ROLES];

/**
 * 役割ごとに、import してよい相手。ここに無いものは全部だめ。
 * "type" は `import type` だけ許す。実行時には依存せず、形だけを借りる。
 *
 * 矢印は全部 model と service に向かう。model は外を何も知らない。
 * service は手順で、アダプターの形を宣言する。アダプターはその形を型だけ借りて満たす。
 * 入口（リソース、job）は誰として呼ぶかを決め、deps から service を受け取って呼ぶ。
 *
 * 相手の書き方:
 *   パッケージ名（hono-kit, hono-kit/result, zod, drizzle-orm）
 *   自分の domain の役割（model, service, ...）。他の domain のものは "foreign:<role>"
 *   アプリの決めごと（errors, middleware, db, deps）
 */
export const LAYERS = {
  model: {
    zod: "value",
    "hono-kit/system": "type",
    "hono-kit/failures": "type",
    "foreign:model": "type",
  },
  service: {
    "hono-kit/result": "value",
    "hono-kit/failures": "value",
    "hono-kit/page": "type",
    "hono-kit/system": "type",
    model: "value",
    "foreign:model": "type",
  },

  repo: {
    "drizzle-orm": "value",
    "hono-kit/page": "value",
    db: "type",
    // 一意制約の違反がどの列かを見分ける（SQLite の文面を知る場所は hono-kit の 1 か所）
    "hono-kit/sqlite": "value",
    model: "value",
    service: "type",
    "foreign:repo": "value",
    // 集計の SQL で、他 domain の状態の集合（billedStatuses など）を使う
    "foreign:model": "value",
  },
  gateway: { "hono-kit/result": "value", model: "type", service: "type" },
  mailer: { "hono-kit/result": "value", model: "type", service: "type" },
  // キューに積む。積んだものを受け取るのは src/jobs/ の入口
  queue: { model: "type", service: "type" },

  // リソース（src/routes/<名詞>/）。URL の名詞で切った HTTP の入口で、domain の外にある。
  // どの domain の model も使ってよい。service は import せず、deps から受け取る
  resource: {
    "hono-kit": "value",
    zod: "value",
    errors: "value",
    middleware: "value",
    "foreign:model": "value",
    resource: "value",
    response: "value",
    queries: "type",
  },
  // モノを HTTP でどう見せるか。モノのルールではないので、リソースの側に置く
  response: {
    "hono-kit": "value",
    zod: "value",
    "foreign:model": "value",
    response: "value",
    // 見せるのは _queries が返す画面の 1 行（書いた後も queries で読み直して返す）
    queries: "type",
  },
  // GET の読み（src/routes/<名詞>/_queries.ts）。返す形は画面が決めるので、domain の外にある。
  // SELECT だけの db を受け取り、domain の範囲付きの読み（…Within）を通して画面の 1 行を返す。
  // ルールは作らず、model から借りる（今日の日付の todayOf など）。誰が何を見るかは窓口に actor を渡すだけで、読む側は知らない。
  // 手順は持たないので、service は使わない。
  // 表は直接読めない（no-foreign-table-reads）。範囲の付け忘れが書けないように
  queries: {
    "drizzle-orm": "value",
    "hono-kit/page": "value",
    db: "type",
    "foreign:repo": "value",
    "foreign:model": "value",
  },
  // HTTP 以外の入口（src/jobs/<名前>.ts。cron、キュー）。deps と actor と now は createWorker が渡す。
  // リソースと同じく domain の外にあり、service は deps から受け取る。他の domain の ID の印を付けるため、model の値も使う
  job: { "hono-kit": "type", "foreign:model": "value" },
  // 入口だけの失敗（webhook の署名など）を、HTTP でどう返すか。入口の隣（src/routes/<名詞>/_errors.ts）に置く
  errors: { "hono-kit": "value" },

  // 業務を知らない＝別のアプリにそのまま持っていけるもの（src/lib/。日付、時刻、タイムゾーン）。
  // 一番下の層で、domain もリソースも知らない。だから lib を通して domain どうしがつながることはない
  lib: { zod: "value", lib: "value" },
};

// lib は一番下の層なので、どの役割からも値で使える
for (const allowed of Object.values(LAYERS)) allowed.lib ??= "value";

/** domain の外にある、入口の役割 */
export const ENTRY_ROLES = ["resource", "response", "queries", "job", "errors"];

/** よくある間違いには、どうすればいいかを添える */
export const HINTS = {
  "model→service":
    "model holds only the thing and its rules. Put steps in service",
  "model→hono-kit/result":
    "model has no steps that return failures. Put steps in service",
  "service→hono-kit":
    "service may only use Result from hono-kit. Import it from hono-kit/result",
  "service→foreign:service":
    "Domains do not call each other. Join them at the entry point: the handler (or a job) reads from both services and passes values to the one that writes. See node_modules/hono-kit/docs/cross-domain.md",
  "repo→foreign:service":
    "Read with a join in your own repo (you may import the table from the other repo)",
  "resource→foreign:service":
    "A resource does not import services. The handler receives them from deps as its third argument ({ customers, invoices })",
  "resource→foreign:repo":
    "A resource does not read tables. Read in _queries.ts next to it, or through the owner's service, received from deps",
  "job→foreign:service":
    "A job does not import services. It receives them from deps ({ deps, actor, now })",
  "response→resource":
    "_response.ts only shows things. Import it from index.ts, not the other way",
};

/** domain の中から入口（src/routes/、src/jobs/）を見たとき。向きは入口 → domains の一方だけ */
export const ENTRY_HINT =
  "Domains do not know entry points. src/routes/ and src/jobs/ use domains, never the other way";

/** domain の中に errors.ts を置いたとき。モノの失敗は model、入口だけの失敗は入口の隣 */
export const ERRORS_HINT =
  "A domain has no errors.ts. Failures of the thing go in model.ts as a Failure; failures only an entry point has (webhook signatures, ...) go next to it in src/routes/<noun>/_errors.ts";

/** model と service は、自分の domain のアダプターを知らない。形は service が宣言する */
for (const from of ["model", "service"]) {
  for (const to of ADAPTER_ROLES) {
    HINTS[`${from}→${to}`] ??=
      `${from} does not know ${to}. Declare the shape you need as a type in service; ${to} fulfills it`;
  }
}

/**
 * 許可表の補足。docs/layout.md の表の「import してよいもの」の後ろに付く。
 * 表そのものは LAYERS から作るので、ここには表で言い切れないことだけを書く
 */
export const NOTES = {
  errors:
    "`src/routes/<noun>/_errors.ts`: failures only that entry point has (webhook signatures, ...). Failures of the thing go in model.ts as a Failure. Ones that mean the same in every domain (401, 403, 404) are hono-kit standards (NotFound, ...)",
  lib: "Code that knows nothing of this app's business, so it could move to another app as is (dates, times, time zones). Anything that names a thing of this app (a role, a status) belongs to its domain instead",
  repo: "From another domain's repo, only foreign-key tables (…Table) and scoped reads (…Within); from another domain's model, only SQL constants and types",
  resource:
    "`src/routes/<noun>/index.ts`, outside domains: `export const GET = createEndpoint(...)`, one per method. Services come from deps (the handler's third argument), never imported",
  response: "`src/routes/<noun>/_response.ts`: how a thing is shown over HTTP",
  queries:
    "`src/routes/<noun>/_queries.ts`: the reads of the GET endpoints, wired into deps by `hnk gen`. Tables only through …Within (no-foreign-table-reads); from another domain's model, rules to borrow (todayOf, ...)",
  job: "`src/jobs/<name>.ts`, outside domains: runs on a schedule (cron) or a queue message. createWorker passes deps, actor and now. It may join several domains' services from deps",
  queue: "Puts jobs on a queue. What takes them off is a job in src/jobs/",
};
