/**
 * The reads of /notes and /notes/:id, through the notes window (notesWithin)
 */
import { eq } from "drizzle-orm";
import type { ReadDb } from "#src/db/index";
import type { NoteId } from "#src/domains/notes/model";
import { notesWithin } from "#src/domains/notes/repo.d1";

/** A note as the screen shows it. The select decides its shape */
const seen = (db: ReadDb) => {
  const notes = notesWithin(db);
  const query = db
    .select({ id: notes.id, createdAt: notes.createdAt, updatedAt: notes.updatedAt })
    .from(notes);

  return { notes, query };
};

export type NoteRow = Awaited<ReturnType<typeof seen>["query"]>[number];

export function notesQueries(db: ReadDb) {
  return {
    /** null if absent */
    async get(id: NoteId): Promise<NoteRow | null> {
      const { notes, query } = seen(db);
      const [row] = await query.where(eq(notes.id, id)).limit(1);

      return row ?? null;
    },
  };
}
