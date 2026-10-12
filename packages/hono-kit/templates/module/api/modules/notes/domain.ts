/**
 * The note. What it is and which rules it has (What).
 * It knows no steps, HTTP or DB. Every other file points here
 */
import { z } from "zod";
import type { Actor, OrgId, UserId } from "../users/domain";

/**
 * The note ID. A brand to tell it apart from a plain string.
 * Mixing it up with other IDs (user, organization) is a type error. Only noteId below may apply the brand
 */
declare const noteIdBrand: unique symbol;

export type NoteId = string & { readonly [noteIdBrand]: true };

/** Brands a string from outside or from the DB as a note ID. The only place that writes `as` */
export const noteId = (value: string) => value as NoteId;

export const newNoteId = () => noteId(crypto.randomUUID());

/** An ID in the input (URL or body). Branded once it passes validation */
export const noteIdSchema = z.string().min(1).transform(noteId);

export type Note = {
  id: NoteId;
  /** The organization. The creator's, and it never changes */
  orgId: OrgId;
  ownerId: UserId;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Rules. Frontend forms use these too.
 * Only validated values carry the NoteInput brand. service accepts only this type, so
 * no entry point can skip validation and save
 */
export const noteInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(100, "Title must be at most 100 characters"),
    body: z.string().trim().min(1, "Body is required").max(20000, "Body must be at most 20000 characters"),
  })
  .brand<"NoteInput">();

/** The value received on create and update. Validated and branded */
export type NoteInput = z.infer<typeof noteInputSchema>;

/** What may be changed. id and ownerId cannot */
export type NoteChanges = Partial<Pick<Note, "title" | "body">> & Pick<Note, "updatedAt">;

/**
 * Which notes the actor may touch. No reach crosses organizations (except all).
 * A member reaches only their own
 */
export type NoteReach =
  | { kind: "all" }
  | { kind: "org"; orgId: OrgId }
  | { kind: "member"; orgId: OrgId; userId: UserId };

/** The system reaches every organization, an admin everything in their organization, a member only their own */
export const reachOf = (actor: Actor): NoteReach => {
  if (actor.kind === "system") return { kind: "all" };
  if (actor.role === "admin") return { kind: "org", orgId: actor.orgId };

  return { kind: "member", orgId: actor.orgId, userId: actor.id };
};
