/**
 * Storage for notes. Fulfills the NotesRepository declared in service.ts with D1.
 * Row shapes never leave this file; rows are mapped to the domain Note
 */
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { toPage } from "hono-kit/page";
import type { Scope } from "../../db";
import { orgId, userId } from "../users/domain";
import { noteId, type Note, type NoteReach } from "./domain";
import type { NotesRepository } from "./service";

/** Column default: the current time (ms). A SQL expression, not a JS Date */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** A note. Has an organization and an owner */
export const notesTable = sqliteTable(
  "__snake__",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    /** The owner's user id. No foreign key yet, since there is no users table (add one once the auth provider is decided) */
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (table) => [
    // Follows the list order directly (own items, most recently updated first)
    index("__snake___owner_updated_idx").on(table.orgId, table.ownerId, table.updatedAt, table.id),
    // The order when an admin sees everything in the organization
    index("__snake___org_updated_idx").on(table.orgId, table.updatedAt, table.id),
  ],
);

type NoteRow = typeof notesTable.$inferSelect;

/** Row → thing. Same shape today, but this is the gate that keeps new columns out of domain */
const toNote = (row: NoteRow): Note => ({
  id: noteId(row.id),
  orgId: orgId(row.orgId),
  ownerId: userId(row.ownerId),
  title: row.title,
  body: row.body,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Turns the reach into a WHERE condition. all means no filter */
const within = (reach: NoteReach) => {
  switch (reach.kind) {
    case "all":
      return undefined;
    case "org":
      return eq(notesTable.orgId, reach.orgId);
    case "member":
      return and(eq(notesTable.orgId, reach.orgId), eq(notesTable.ownerId, reach.userId));
  }
};

export function notesRepository(scope: Scope<typeof notesTable>): NotesRepository {
  return {
    async listWithin(reach, { after, limit }) {
      // Read one extra row to know whether there is more
      const rows = await scope.reads
        .select()
        .from(notesTable)
        .where(
          and(
            within(reach),
            after
              ? or(
                  lt(notesTable.updatedAt, after.at),
                  and(eq(notesTable.updatedAt, after.at), lt(notesTable.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notesTable.updatedAt), desc(notesTable.id))
        .limit(limit + 1);

      return toPage(rows.map(toNote), limit, (note) => ({ at: note.updatedAt, id: note.id }));
    },

    async findWithin(id, reach) {
      const [row] = await scope.reads
        .select()
        .from(notesTable)
        .where(and(eq(notesTable.id, id), within(reach)))
        .limit(1);

      return row ? toNote(row) : null;
    },

    async insert(note) {
      const [row] = await scope.insert(note).returning();
      if (!row) throw new Error(`note ${note.id} was not returned after insert`);

      return toNote(row);
    },

    // Put the reach in WHERE and do it in one statement, so nothing can slip in between check and write
    async updateWithin(id, reach, changes) {
      const [row] = await scope
        .update(changes)
        .where(and(eq(notesTable.id, id), within(reach)))
        .returning();

      return row ? toNote(row) : null;
    },

    async deleteWithin(id, reach) {
      const rows = await scope
        .delete()
        .where(and(eq(notesTable.id, id), within(reach)))
        .returning({ id: notesTable.id });

      return rows.length > 0;
    },
  };
}
