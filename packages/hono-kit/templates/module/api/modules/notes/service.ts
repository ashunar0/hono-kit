/**
 * The steps for notes (How). What to do with the domain thing, in what order
 */
import { err, ok, type Result } from "hono-kit/result";
import { NotFound } from "hono-kit/failures";
import type { Page, PageQuery } from "hono-kit/page";
import type { Actor, User } from "../users/domain";
import {
  newNoteId,
  reachOf,
  type Note,
  type NoteChanges,
  type NoteId,
  type NoteInput,
  type NoteReach,
} from "./domain";

/** One page of the list. Position is by most recently updated (updatedAt and id) */
export type NotePage = Page<Note>;

/**
 * The storage shape the steps need. Declared here, by the user of it; repo.d1.ts fulfills it.
 * service does not know the storage implementation, so tests can pass a stand-in of the same shape
 */
export type NotesRepository = {
  /** One page within the reach, most recently updated first */
  listWithin(reach: NoteReach, query: PageQuery): Promise<NotePage>;
  /** null if not within the reach */
  findWithin(id: NoteId, reach: NoteReach): Promise<Note | null>;
  insert(note: Note): Promise<Note>;
  /** Updates only within the reach. null if absent */
  updateWithin(id: NoteId, reach: NoteReach, changes: NoteChanges): Promise<Note | null>;
  /** Deletes only within the reach. true if deleted */
  deleteWithin(id: NoteId, reach: NoteReach): Promise<boolean>;
};

/**
 * Argument order: as whom (actor) → what → how → when (now).
 * It never reads the clock. Steps that need time take the now decided by the entry point
 */
export function notesService(repo: NotesRepository) {
  return {
    /** List. Only what is within reach, most recently updated first */
    async list(actor: Actor, query: PageQuery): Promise<NotePage> {
      return repo.listWithin(reachOf(actor), query);
    },

    /** Anything outside the reach is not even revealed to exist */
    async get(actor: Actor, id: NoteId): Promise<Result<Note, typeof NotFound.code>> {
      const found = await repo.findWithin(id, reachOf(actor));
      if (found === null) return err(NotFound.code);

      return ok(found);
    },

    /** Create. The creator becomes the owner */
    async create(actor: User, input: NoteInput, now: Date): Promise<Note> {
      return repo.insert({
        id: newNoteId(),
        orgId: actor.orgId,
        ownerId: actor.id,
        title: input.title,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      });
    },

    /** Only what is within reach can be updated */
    async update(
      actor: Actor,
      id: NoteId,
      input: NoteInput,
      now: Date,
    ): Promise<Result<Note, typeof NotFound.code>> {
      const changes = { title: input.title, body: input.body, updatedAt: now };
      const updated = await repo.updateWithin(id, reachOf(actor), changes);
      if (updated === null) return err(NotFound.code);

      return ok(updated);
    },

    /** Only what is within reach can be deleted */
    async remove(actor: Actor, id: NoteId): Promise<Result<void, typeof NotFound.code>> {
      const deleted = await repo.deleteWithin(id, reachOf(actor));
      if (!deleted) return err(NotFound.code);

      return ok(undefined);
    },
  };
}
