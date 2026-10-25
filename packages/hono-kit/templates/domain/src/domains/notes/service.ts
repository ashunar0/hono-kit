/**
 * The writing steps for notes (How). What to do with the domain thing, in what order.
 * Reads go in reader.ts: every call to a service is a write, as the entry point sees it
 */
import { newNoteId, type Note, type NoteId } from "./model";

/**
 * The storage shape the steps need. Declared here, by the user of it; repo.d1.ts fulfills it.
 * service does not know the storage implementation, so tests can pass a stand-in of the same shape
 */
export type NotesRepository = {
  /** null if absent */
  find(id: NoteId): Promise<Note | null>;
  insert(note: Note): Promise<Note>;
};

/**
 * Argument order: as whom (actor) → what → how → when (now).
 * It never reads the clock. Steps that need time take the now decided by the entry point
 */
export function notesService(repo: NotesRepository) {
  return {
    async create(now: Date): Promise<NoteId> {
      const created = await repo.insert({ id: newNoteId(), createdAt: now, updatedAt: now });

      return created.id;
    },
  };
}
