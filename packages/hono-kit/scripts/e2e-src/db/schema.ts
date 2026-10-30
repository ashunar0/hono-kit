/**
 * The tables of the e2e app. Replaces the template's empty schema.ts
 */
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const notesTable = sqliteTable("notes", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** A row with a version, for updateWithVersion (hono-kit/sqlite) */
export const draftsTable = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  version: integer("version").notNull(),
});

/** Keyed by something other than id (one row per book), for updateWithVersion */
export const shelvesTable = sqliteTable("shelves", {
  bookId: text("book_id").primaryKey(),
  count: integer("count").notNull(),
  version: integer("version").notNull(),
});

/** Keyed by two columns, which updateWithVersion does not take */
export const seatsTable = sqliteTable(
  "seats",
  {
    roomId: text("room_id").notNull(),
    number: integer("number").notNull(),
    version: integer("version").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.number] })],
);
