/**
 * The reads of notes. Through the domain's rules (model), it returns the domain thing.
 * An entry point asks it before a write and passes what it read as a value.
 * The reads that shape a screen are not here but in the resource's _queries.ts
 */
import { err, ok, type Result } from "hono-kit/result";
import { NotFound } from "hono-kit/failures";
import type { Note, NoteId } from "./model";
import type { NotesRepository } from "./service";

/** The reading part of the storage shape. It gets no method that writes, so nothing here can write */
export type NotesReads = Pick<NotesRepository, "find">;

/** Argument order is the same as service: as whom (actor) → what → when (now). It never reads the clock */
export function notesReader(repo: NotesReads) {
  return {
    async get(id: NoteId): Promise<Result<Note, typeof NotFound.code>> {
      const found = await repo.find(id);
      if (found === null) return err(NotFound.code);

      return ok(found);
    },
  };
}

export type NotesReader = ReturnType<typeof notesReader>;
