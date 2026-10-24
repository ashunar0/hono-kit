/**
 * Storage for notes. Fulfills the NotesRepository declared in service.ts with D1.
 * Row shapes never leave this file; rows are mapped to the domain Note
 */
import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createRepository } from "hono-kit/service";
import type { ReadDb, Scope } from "#src/db/index";
import { noteId, type Note } from "./model";
import type { NotesRepository } from "./service";

/** Column default: the current time (ms). A SQL expression, not a JS Date */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const notesTable = sqliteTable("__snake__", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

type NoteRow = typeof notesTable.$inferSelect;

/** Row → thing. Same shape today, but this is the gate that keeps new columns out of domain */
const toNote = (row: NoteRow): Note => ({
  id: noteId(row.id),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * The window every outside read of notes goes through: the GET queries in src/routes, and other domains.
 * Nobody reads notesTable directly (no-foreign-table-reads). When who looks decides what is seen,
 * take actor and narrow the rows here with reachOf: notesWithin(db, actor)
 */
export const notesWithin = (db: ReadDb) => db.select().from(notesTable).as("__snake___within");

/** The tables it may write. The read side receives only the read-only db */
type NotesScopes = { scope: Scope<typeof notesTable> };

export const notesRepository = createRepository({
  read: ({ scope }): NotesRepository["read"] => ({
    async find(id) {
      const [row] = await scope.select().from(notesTable).where(eq(notesTable.id, id)).limit(1);

      return row ? toNote(row) : null;
    },
  }),

  write: ({ scope }: NotesScopes): NotesRepository["write"] => ({
    async insert(note) {
      const [row] = await scope.insert(note).returning();
      if (!row) throw new Error(`note ${note.id} was not returned after insert`);

      return toNote(row);
    },
  }),
});
