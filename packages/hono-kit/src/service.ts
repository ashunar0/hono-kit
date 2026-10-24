/**
 * Splits a service (or a repository) into what only reads and what writes, by what each part can touch.
 *
 * Every port the part uses (a repository, a db scope, a gateway) that has a `read` side hands only that side
 * to `read`. A port without one (a mailer, a queue, batch) is not handed to `read` at all.
 * So a read cannot write: what it would write with is not in its scope, and the type says so.
 * Entry points call `invoices.read.get(...)` / `invoices.write.send(...)`, so a write is told from a read
 * by where it lives, never by its name (`hnk/route-writes-once` counts `.write.` calls)
 */

/** The read sides of the ports: `{ repo: { read, write }, mailer }` → `{ repo: read }` */
export type ReadSides<P> = {
  [K in keyof P as P[K] extends { read: unknown } ? K : never]: P[K] extends {
    read: infer R;
  }
    ? R
    : never;
};

type Parts<P, R, W> = {
  /** What only reads. It receives only the read sides of the ports */
  read: (ports: ReadSides<P>) => R;
  /** What writes. It receives every port, read sides included. Annotate its argument: the ports are inferred from it */
  write: (ports: P) => W;
};

const readSidesOf = <P extends object>(ports: P) =>
  Object.fromEntries(
    Object.entries(ports).flatMap(([name, port]) =>
      port !== null &&
      (typeof port === "object" || typeof port === "function") &&
      "read" in port
        ? [[name, port.read]]
        : [],
    ),
  ) as ReadSides<P>;

const split =
  <P extends object, R extends object, W extends object>(
    parts: Parts<P, R, W>,
  ) =>
  (ports: P): { read: R; write: W } => ({
    read: parts.read(readSidesOf(ports)),
    write: parts.write(ports),
  });

/**
 * A service: the steps of a domain, split into reads and writes.
 *
 * ```ts
 * export const invoicesService = createService({
 *   read: ({ repo }) => ({ async get(actor: Actor, id: InvoiceId) { ... repo.find(...) } }),
 *   write: ({ repo, mailer }: { repo: InvoicesRepository; mailer: Mailer }) => ({ async send(...) { ... } }),
 * });
 * // deps.ts
 * const invoices = invoicesService({ repo: invoicesRepository(...), mailer: resendMailer(...) });
 * ```
 */
export const createService = split;

/**
 * A repository: the same split, one level down. Its ports are db scopes, whose read side is the read-only db.
 * Annotate each part's return type with the shape service declared, so the methods are typed from it.
 *
 * ```ts
 * export const invoicesRepository = createRepository({
 *   read: ({ invoices }): InvoicesRepository["read"] => ({ async find(reach, id) { ... } }),
 *   write: ({ invoices }: { invoices: Scope<typeof invoicesTable> }): InvoicesRepository["write"] => ({ ... }),
 * });
 * ```
 */
export const createRepository = split;
