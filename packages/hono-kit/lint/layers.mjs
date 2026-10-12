/**
 * module の中の役割と、それが core / inbound / outbound のどれか。
 * ここに無い名前のファイルは module の中に置けない（layer-imports が止める）
 */
export const KINDS = {
  domain: "core",
  service: "core",
  errors: "inbound",
  cron: "inbound",
  queue: "inbound",
  repo: "outbound",
  gateway: "outbound",
  mailer: "outbound",
  jobs: "outbound",
};

/**
 * 役割ごとに、import してよい相手。ここに無いものは全部だめ。
 * "type" は `import type` だけ許す。実行時には依存せず、形だけを借りる。
 *
 * 矢印は全部 core に向かう。domain は外を何も知らない。
 * service は手順で、outbound の形を宣言する。outbound はその形を満たす。
 * inbound は誰として呼ぶかを決め、deps から core を受け取って呼ぶ。
 *
 * 相手の書き方:
 *   パッケージ名（hono-kit, hono-kit/result, zod, drizzle-orm）
 *   自分の module の役割（domain, service, ...）。他の module のものは "foreign:<role>"
 *   アプリの決めごと（errors, middleware, db, dbErrors, deps）
 */
export const LAYERS = {
  // core
  domain: {
    zod: "value",
    "hono-kit/system": "type",
    "hono-kit/failures": "type",
    "foreign:domain": "type",
  },
  service: {
    "hono-kit/result": "value",
    "hono-kit/failures": "value",
    "hono-kit/page": "type",
    "hono-kit/system": "type",
    domain: "value",
    "foreign:domain": "type",
  },

  // その module だけの失敗を、HTTP でどう返すか。HTTP の入口（api/routes/）が使う
  errors: { "hono-kit": "value" },
  // inbound（HTTP 以外）。deps と actor と now は createWorker が渡す。
  // 入口なので、複数の module の service を deps から受け取ってつなぐ。他の module の ID の印を付けるため、domain の値も使う
  cron: { "hono-kit": "type", domain: "value", "foreign:domain": "value" },
  queue: { "hono-kit": "type", domain: "value", "foreign:domain": "value" },

  // outbound
  repo: {
    "drizzle-orm": "value",
    "hono-kit/page": "value",
    db: "type",
    // 一意制約の違反を見分ける（D1 の文面を知る場所は 1 つにする）
    dbErrors: "value",
    domain: "value",
    service: "type",
    "foreign:repo": "value",
    // 集計の SQL で、他 module の状態の集合（billedStatuses など）を使う
    "foreign:domain": "value",
  },
  gateway: { "hono-kit/result": "value", domain: "type", service: "type" },
  mailer: { "hono-kit/result": "value", domain: "type", service: "type" },
  jobs: { domain: "type", service: "type" },

  // リソース（api/routes/<名詞>/）。URL の名詞で切った HTTP の入口で、module の外にある。
  // どの module の domain も使ってよい。service は import せず、deps から受け取る
  resource: {
    "hono-kit": "value",
    zod: "value",
    errors: "value",
    middleware: "value",
    "foreign:domain": "value",
    "foreign:errors": "value",
    resource: "value",
    response: "value",
  },
  // モノを HTTP でどう見せるか。モノのルールではないので、リソースの側に置く
  response: {
    "hono-kit": "value",
    zod: "value",
    "foreign:domain": "value",
    response: "value",
  },
};

/** module の外にある、リソースの役割。README の表の「側」に使う */
export const RESOURCE_ROLES = { resource: "inbound", response: "inbound" };

/** よくある間違いには、どうすればいいかを添える */
export const HINTS = {
  "domain→service": "domain holds only the thing and its rules. Put steps in service",
  "domain→hono-kit/result":
    "domain has no steps that return failures. Put steps in service",
  "service→hono-kit":
    "service may only use Result from hono-kit. Import it from hono-kit/result",
  "service→foreign:service":
    "Modules do not call each other. Join them at the entry point: the handler (or cron / queue) reads from both services and passes values to the one that writes. See node_modules/hono-kit/docs/cross-module.md",
  "repo→foreign:service":
    "Read with a join in your own repo (you may import the table from the other repo)",
  "resource→foreign:service":
    "A resource does not import services. The handler receives them from deps as its third argument ({ customers, invoices })",
  "resource→foreign:repo":
    "A resource does not read tables. Read through the owner's service, received from deps",
  "response→resource":
    "response.ts only shows things. Import it from index.ts, not the other way",
};

/** module の中から api/routes/ を見たとき。向きは routes → modules の一方だけ */
export const RESOURCE_HINT =
  "Modules do not know routes. api/routes/ uses modules, never the other way";

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
    "Entry-point-only failures (webhook signatures, ...). Failures of the thing go in domain.ts as a Failure. Ones that mean the same in every module (401, 403, 404) are hono-kit standards (NotFound, ...)",
  cron: "createWorker passes deps, actor and now. An entry point: it may join several modules' services from deps",
  queue: "Same as cron",
  repo: "From another module's repo, only foreign-key tables (…Table) and scoped reads (…Within); from another module's domain, only SQL constants and types",
  resource:
    "`api/routes/<noun>/index.ts`, outside modules. Services come from deps (the handler's third argument), never imported",
  response: "`api/routes/<noun>/response.ts`: how a thing is shown over HTTP",
};
