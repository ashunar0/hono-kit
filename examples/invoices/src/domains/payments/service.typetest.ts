import { systemActor } from "hono-kit/testing";
import type { User } from "#src/domains/users/model";
import type { PaymentEvent } from "./model";
import type { PaymentsService } from "./service";

// 支払いの結果を反映できるのはシステム（webhook）だけ。利用者の route からは呼べない
export async function usersCannotReceive(
  payments: PaymentsService,
  user: User,
  event: PaymentEvent,
) {
  // @ts-expect-error receive が受け取るのは System だけ
  await payments.receive(user, event, new Date());

  await payments.receive(systemActor, event, new Date());
}
