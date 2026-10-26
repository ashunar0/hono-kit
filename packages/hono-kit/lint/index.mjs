/**
 * hnk の形を守らせる oxlint のプラグイン。アプリの .oxlintrc.json で
 * `"jsPlugins": ["hono-kit/lint"]` として読み込む
 */
import noClockOutsideAppEntry from "./rules/no-clock-outside-app-entry.mjs";
import noIdCast from "./rules/no-id-cast.mjs";
import noModuleScopeState from "./rules/no-module-scope-state.mjs";
import noNewHono from "./rules/no-new-hono.mjs";
import routeExportsEndpoints from "./rules/route-exports-endpoints.mjs";
import routeRepliesThroughReply from "./rules/route-replies-through-reply.mjs";
import routeResponds200 from "./rules/route-responds-200.mjs";

export default {
  meta: { name: "hnk" },
  rules: {
    "no-clock-outside-app-entry": noClockOutsideAppEntry,
    "route-exports-endpoints": routeExportsEndpoints,
    "route-replies-through-reply": routeRepliesThroughReply,
    "no-id-cast": noIdCast,
    "no-module-scope-state": noModuleScopeState,
    "route-responds-200": routeResponds200,
    "no-new-hono": noNewHono,
  },
};
