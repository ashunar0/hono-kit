/**
 * module の中の役割と、それが core / inbound / outbound のどれか。
 * ここに無い名前のファイルは module の中に置けない（layer-imports が止める）
 */
export const KINDS = {
  domain: "core",
  service: "core",
  commands: "core",
  routes: "inbound",
  webhook: "inbound",
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
  // 他の module に変えさせてよい操作。使う outbound の形は service の宣言を借りる
  commands: {
    "hono-kit/result": "value",
    "hono-kit/failures": "value",
    "hono-kit/system": "type",
    domain: "value",
    service: "type",
    "foreign:domain": "type",
  },

  // inbound（HTTP）
  routes: {
    "hono-kit": "value",
    zod: "value",
    errors: "value",
    middleware: "value",
    domain: "value",
  },
  // 利用者のいない HTTP。誰として呼ぶか（システム）は allowSystem から c.get("actor") で受け取る
  webhook: {
    "hono-kit": "value",
    zod: "value",
    errors: "value",
    middleware: "value",
    domain: "value",
  },
  // その module だけの失敗を、HTTP でどう返すか。routes と webhook が使う
  errors: { "hono-kit": "value" },
  // inbound（HTTP 以外）。deps と actor と now は createWorker が渡すので、型を借りるだけ
  cron: { "hono-kit": "type", domain: "type" },
  queue: { "hono-kit": "type", domain: "type" },

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
  "service→routes":
    "service does not know HTTP. Return failures as Result codes; routes decides the status",
  "service→hono-kit":
    "service may only use Result from hono-kit. Import it from hono-kit/result",
  "service→foreign:service":
    "Do not import other modules. Declare the shape you use in service and wire it in deps.ts. To write, have the other module's commands/ passed in",
  "routes→foreign:domain":
    'routes act as the authenticated user. For an entry point that needs the system, put allowSystem in middleware and read c.get("actor")',
  "routes→foreign:errors":
    "Do not borrow another module's entry-point failures. A failure your service returns goes in your domain.ts as a Failure; one that means the same in every module (401, 403, 404) is a hono-kit standard (NotFound, ...)",
  "webhook→foreign:errors":
    "Do not borrow another module's entry-point failures. A failure your service returns goes in your domain.ts as a Failure; one that means the same in every module (401, 403, 404) is a hono-kit standard (NotFound, ...)",
  "routes→foreign:service":
    "Call another module's operations from the service that owns the flow",
  "repo→foreign:service":
    "Read with a join in your own repo (you may import the table from the other repo)",
  "resource→foreign:service":
    "A resource does not import services. The handler receives them from deps as its third argument ({ stores, menus })",
  "resource→foreign:commands":
    "A resource does not import services. The handler receives them from deps as its third argument ({ stores, menus })",
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
    "inbound does not import service or commands. Receive them from deps and call them",
  "outbound→inbound": "outbound does not know inbound",
};

/**
 * 許可表の補足。README の表の「import してよいもの」の後ろに付く。
 * 表そのものは LAYERS から作るので、ここには表で言い切れないことだけを書く
 */
export const NOTES = {
  webhook: "actor (the system) comes from `allowSystem`",
  errors:
    "Entry-point-only failures (webhook signatures, ...). Failures of the thing go in domain.ts as a Failure. Ones that mean the same in every module (401, 403, 404) are hono-kit standards (NotFound, ...)",
  cron: "createWorker passes deps, actor and now",
  repo: "From another module's repo, only foreign-key tables (…Table) and scoped reads (…Within); from another module's domain, only SQL constants and types",
  resource:
    "`api/routes/<noun>/index.ts`, outside modules. Services come from deps (the handler's third argument), never imported",
  response: "`api/routes/<noun>/response.ts`: how a thing is shown over HTTP",
};
