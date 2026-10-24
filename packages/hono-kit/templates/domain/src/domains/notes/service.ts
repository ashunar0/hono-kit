/**
 * The steps for notes (How). What to do with the domain thing, in what order
 */
import { err, ok, type Result } from "hono-kit/result";
import { createService } from "hono-kit/service";
import { NotFound } from "hono-kit/failures";
import { newNoteId, type Note, type NoteId } from "./model";

/**
 * The storage shape the steps need. Declared here, by the user of it; repo.d1.ts fulfills it.
 * service does not know the storage implementation, so tests can pass a stand-in of the same shape.
 * read only reads and write writes. The service's read receives only this read side
 */
export type NotesRepository = {
  read: {
    /** null if absent */
    find(id: NoteId): Promise<Note | null>;
  };
  write: {
    insert(note: Note): Promise<Note>;
  };
};

/**
 * What the steps use, passed by deps.ts. read receives only the read side of each
 * (a port with no read side, such as a mailer, is not passed to read at all)
 */
export type NotesPorts = { repo: NotesRepository };

/**
 * Argument order: as whom (actor) → what → how → when (now).
 * It never reads the clock. Steps that need time take the now decided by the entry point
 */
export const notesService = createService({
  read: ({ repo }) => ({
    async get(id: NoteId): Promise<Result<Note, typeof NotFound.code>> {
      const found = await repo.find(id);
      if (found === null) return err(NotFound.code);

      return ok(found);
    },
  }),

  write: ({ repo }: NotesPorts) => ({
    async create(now: Date): Promise<NoteId> {
      const created = await repo.write.insert({ id: newNoteId(), createdAt: now, updatedAt: now });

      return created.id;
    },
  }),
});
