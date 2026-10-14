import { expect, it } from "vitest";
import { scopeTo } from "../../db";
import { db } from "../../../test/fixtures";
import { noteId } from "./model";
import { notesRepository, notesTable } from "./repo.d1";
import { notesService } from "./service";

const notes = () => notesService(notesRepository(scopeTo(db(), notesTable)));

it("reads back what it created, and NOT_FOUND for an unknown id", async () => {
  const id = await notes().create(new Date());

  const found = await notes().get(id);
  expect(found.ok && found.value.id).toBe(id);

  const missing = await notes().get(noteId(crypto.randomUUID()));
  expect(missing).toEqual({ ok: false, error: "NOT_FOUND" });
});
