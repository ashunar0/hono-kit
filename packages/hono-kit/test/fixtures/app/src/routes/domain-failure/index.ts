// expect: hnk(route-no-domain-failures) | ProfileRequired is a failure of the f1 domain, so its service decides it
// expect: hnk(route-no-domain-failures) | ProfileRequired is a failure of the f1 domain, so its service decides it
// domain の Failure を handler が自分で返すと、別の入口から呼んだときにそのルールが効かない。
// service の結果、入口だけの失敗（_errors.ts）、hono-kit の 404 は返してよい
import { createEndpoint, fail as raise, NotFound } from "hono-kit";
import { requireAuth } from "../../middleware/auth";
import { ProfileRequired } from "../../domains/f1/model";
import { SignatureInvalid } from "./_errors";

export const POST = createEndpoint(
  { auth: requireAuth, responses: {} },
  async (_c, reply, { f1 }) => {
    const profile = await f1.read.get();
    if (profile === null) return reply.failure(ProfileRequired.code);
    if (profile === undefined) throw raise(ProfileRequired);

    const result = await f1.write.create();
    if (!result.ok) return reply.failure(result.error);
    if (result.value === null) return reply.failure(NotFound.code);

    return reply.failure(SignatureInvalid.code);
  },
);
