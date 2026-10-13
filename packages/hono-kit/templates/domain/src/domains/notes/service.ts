/**
 * The steps for notes (How). What to do with the domain thing, in what order
 */
import { err, ok, type Result } from "hono-kit/result";
import { NotFound } from "hono-kit/failures";
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
    async get(id: NoteId): Promise<Result<Note, typeof NotFound.code>> {
      const found = await repo.find(id);
      if (found === null) return err(NotFound.code);

      return ok(found);
    },

    async create(now: Date): Promise<Note> {
      return repo.insert({ id: newNoteId(), createdAt: now, updatedAt: now });
    },
  };
}
