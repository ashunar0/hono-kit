import { expect, it } from "vitest";
import { scopeTo } from "#src/db/index";
import { db } from "../../../test/fixtures";
import { noteId } from "./model";
import { notesReader } from "./reader";
import { notesRepository, notesTable } from "./repo.d1";
import { notesService } from "./service";

const repo = () => notesRepository(scopeTo(db(), notesTable));
const notes = () => notesService(repo());
const reader = () => notesReader(repo());

it("reads back what it created, and NOT_FOUND for an unknown id", async () => {
  const id = await notes().create(new Date());

  const found = await reader().get(id);
  expect(found.ok && found.value.id).toBe(id);

  const missing = await reader().get(noteId(crypto.randomUUID()));
  expect(missing).toEqual({ ok: false, error: "NOT_FOUND" });
});
