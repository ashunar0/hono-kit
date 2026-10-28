/**
 * The tables of the e2e app. Replaces the template's empty schema.ts
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
