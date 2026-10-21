// expect: hnk(route-lists-are-paged) | This list route has no limit
// expect: hnk(route-declares-auth) | The endpoint does not declare auth
// expect: hnk(route-responds-200) | Success is always 200
import { createEndpoint } from "hono-kit";
import { requireAuth } from "../../middleware/auth";

declare const pageQuerySchema: (filters?: unknown) => object;
declare const z: { object: (shape: object) => object };

// createEndpoint でも、一覧（パスが [id] で終わらない GET）には上限が要る
export const GET = createEndpoint(
  {
    middleware: [requireAuth],
    request: { query: z.object({}) },
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);

// 認証を宣言していない
export const POST = createEndpoint({ responses: {} }, async () => {
  throw new Error("fixture");
});

// 上限があれば通る。200 以外の成功は止める
export const PUT = createEndpoint(
  {
    middleware: [requireAuth],
    request: { query: pageQuerySchema(z.object({})) },
    responses: { 201: {} },
  },
  async () => {
    throw new Error("fixture");
  },
);
