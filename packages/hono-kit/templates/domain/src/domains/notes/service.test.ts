import { expect, it } from "vitest";
import { scopeTo } from "#src/db/index";
import { db } from "../../../test/fixtures";
import { noteId } from "./model";
import { notesRepository, notesTable } from "./repo.d1";
import { notesService } from "./service";

const notes = () => notesService({ repo: notesRepository({ scope: scopeTo(db(), notesTable) }) });

it("reads back what it created, and NOT_FOUND for an unknown id", async () => {
  const id = await notes().write.create(new Date());

  const found = await notes().read.get(id);
  expect(found.ok && found.value.id).toBe(id);

  const missing = await notes().read.get(noteId(crypto.randomUUID()));
  expect(missing).toEqual({ ok: false, error: "NOT_FOUND" });
});
