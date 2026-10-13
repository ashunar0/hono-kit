/**
 * domain の中の役割と、それが core / inbound / outbound のどれか。
 * ここに無い名前のファイルは domain の中に置けない（layer-imports が止める）
 */
export const KINDS = {
  model: "core",
  service: "core",
  errors: "inbound",
  repo: "outbound",
  gateway: "outbound",
  mailer: "outbound",
  queue: "outbound",
};

/**
 * 役割ごとに、import してよい相手。ここに無いものは全部だめ。
 * "type" は `import type` だけ許す。実行時には依存せず、形だけを借りる。
 *
 * 矢印は全部 core に向かう。model は外を何も知らない。
 * service は手順で、outbound の形を宣言する。outbound はその形を満たす。
 * inbound は誰として呼ぶかを決め、deps から core を受け取って呼ぶ。
 *
 * 相手の書き方:
 *   パッケージ名（hono-kit, hono-kit/result, zod, drizzle-orm）
 *   自分の domain の役割（model, service, ...）。他の domain のものは "foreign:<role>"
 *   アプリの決めごと（errors, middleware, db, dbErrors, deps）
 */
export const LAYERS = {
  // core
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

  // その domain だけの失敗を、HTTP でどう返すか。HTTP の入口（src/routes/）が使う
  errors: { "hono-kit": "value" },
  // outbound
  repo: {
    "drizzle-orm": "value",
    "hono-kit/page": "value",
    db: "type",
    // 一意制約の違反を見分ける（D1 の文面を知る場所は 1 つにする）
    dbErrors: "value",
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
    "foreign:errors": "value",
    resource: "value",
    response: "value",
  },
  // モノを HTTP でどう見せるか。モノのルールではないので、リソースの側に置く
  response: {
    "hono-kit": "value",
    zod: "value",
    "foreign:model": "value",
    response: "value",
  },
  // HTTP 以外の入口（src/jobs/<名前>.ts。cron、キュー）。deps と actor と now は createWorker が渡す。
  // リソースと同じく domain の外にあり、service は deps から受け取る。他の domain の ID の印を付けるため、model の値も使う
  job: { "hono-kit": "type", "foreign:model": "value" },

  // 業務を知らない＝別のアプリにそのまま持っていけるもの（src/lib/。日付、時刻、タイムゾーン）。
  // 一番下の層で、domain もリソースも知らない。だから lib を通して domain どうしがつながることはない
  lib: { zod: "value", lib: "value" },
};

// lib は一番下の層なので、どの役割からも値で使える
for (const allowed of Object.values(LAYERS)) allowed.lib ??= "value";

/** domain の外にある、入口の役割。README の表の「側」に使う */
export const ENTRY_ROLES = { resource: "inbound", response: "inbound", job: "inbound" };

/** よくある間違いには、どうすればいいかを添える */
export const HINTS = {
  "model→service": "model holds only the thing and its rules. Put steps in service",
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
    "A resource does not read tables. Read through the owner's service, received from deps",
  "job→foreign:service":
    "A job does not import services. It receives them from deps ({ deps, actor, now })",
  "response→resource":
    "response.ts only shows things. Import it from index.ts, not the other way",
};

/** domain の中から入口（src/routes/、src/jobs/）を見たとき。向きは入口 → domains の一方だけ */
export const ENTRY_HINT =
  "Domains do not know entry points. src/routes/ and src/jobs/ use domains, never the other way";

/** 向きの間違いは、役割の組ではなく core / inbound / outbound の組で説明できる */
export const KIND_HINTS = {
  "core→outbound":
    "core does not know outbound. Declare the shape you need as a type in service; outbound fulfills it",
  "core→inbound":
    "core does not know inbound. Return failures as Result codes; inbound decides HTTP status and the like",
  "inbound→outbound":
    "inbound does not know outbound. Receive core from deps and call it",
  "inbound→core":
    "inbound does not import service. Receive it from deps and call it",
  "outbound→inbound": "outbound does not know inbound",
};

/**
 * 許可表の補足。README の表の「import してよいもの」の後ろに付く。
 * 表そのものは LAYERS から作るので、ここには表で言い切れないことだけを書く
 */
export const NOTES = {
  errors:
    "Entry-point-only failures (webhook signatures, ...). Failures of the thing go in model.ts as a Failure. Ones that mean the same in every domain (401, 403, 404) are hono-kit standards (NotFound, ...)",
  lib:
    "Code that knows nothing of this app's business, so it could move to another app as is (dates, times, time zones). Anything that names a thing of this app (a role, a status) belongs to its domain instead",
  repo: "From another domain's repo, only foreign-key tables (…Table) and scoped reads (…Within); from another domain's model, only SQL constants and types",
  resource:
    "`src/routes/<noun>/index.ts`, outside domains. Services come from deps (the handler's third argument), never imported",
  response: "`src/routes/<noun>/response.ts`: how a thing is shown over HTTP",
  job: "`src/jobs/<name>.ts`, outside domains: runs on a schedule (cron) or a queue message. createWorker passes deps, actor and now. It may join several domains' services from deps",
  queue: "Puts jobs on a queue. What takes them off is a job in src/jobs/",
};
