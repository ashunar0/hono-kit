/**
 * hnk の形を守らせる oxlint のプラグイン。アプリの .oxlintrc.json で
 * `"jsPlugins": ["hono-kit/lint"]` として読み込む
 */
import layerImports from "./rules/layer-imports.mjs";
import noClockOutsideAppEntry from "./rules/no-clock-outside-app-entry.mjs";
import noForeignTableReads from "./rules/no-foreign-table-reads.mjs";
import noIdCast from "./rules/no-id-cast.mjs";
import noModuleScopeState from "./rules/no-module-scope-state.mjs";
import noNewHono from "./rules/no-new-hono.mjs";
import routeDeclaresAuth from "./rules/route-declares-auth.mjs";
import routeExportsEndpoints from "./rules/route-exports-endpoints.mjs";
import routeListsArePaged from "./rules/route-lists-are-paged.mjs";
import routeRepliesThroughReply from "./rules/route-replies-through-reply.mjs";
import routeResponds200 from "./rules/route-responds-200.mjs";
import routeWritesOnce from "./rules/route-writes-once.mjs";

export default {
  meta: { name: "hnk" },
  rules: {
    "layer-imports": layerImports,
    "no-foreign-table-reads": noForeignTableReads,
    "no-clock-outside-app-entry": noClockOutsideAppEntry,
    "route-exports-endpoints": routeExportsEndpoints,
    "route-lists-are-paged": routeListsArePaged,
    "route-replies-through-reply": routeRepliesThroughReply,
    "no-id-cast": noIdCast,
    "no-module-scope-state": noModuleScopeState,
    "route-declares-auth": routeDeclaresAuth,
    "route-responds-200": routeResponds200,
    "route-writes-once": routeWritesOnce,
    "no-new-hono": noNewHono,
  },
};
