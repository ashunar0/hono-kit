/**
 * The type of the system (a caller with no user): "as whom" when cron, queues and webhooks call a service.
 * The value is created in only one place inside hono-kit (system-value.ts); apps cannot create it, only receive it.
 * The brand's name is invisible from outside, so writing `{ kind: "system" }` does not make a system.
 * It is not a role, so it cannot sneak into places that handle roles as strings
 */
declare const mark: unique symbol;

export type System = { readonly kind: "system"; readonly [mark]: true };
