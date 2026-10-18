import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeAndReopenActorSheet,
  closeDocSheet,
  openProseMirrorEditor,
  saveProseMirror,
  setProseMirrorText,
  uniqueName,
  waitForProseMirrorValue,
} from "../../../tools/playwright/ui/index.mjs";
import { createMookViaUI } from "./mook-sheet-helpers.mjs";

installConsoleErrorHarness();

const NOTES_PANE = ".mook-notes-content prose-mirror";
const NOTES_FIELD_PATH = "system.information.notes";

test.describe("Notes Pane", () => {
  test("edits the notes and persists them after close/reopen", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);

    await test.step("the notes pane renders empty and its edit toggle appears on hover", async () => {
      const pane = game.locator(`#${sheetId} ${NOTES_PANE}`);
      await expect(pane).toBeVisible();
      const toggle = pane.locator("button.icon.toggle");
      await expect(toggle).toBeHidden();
      await pane.hover();
      await expect(toggle).toBeVisible();
    });

    await test.step("editing the notes saves and persists after close/reopen", async () => {
      const noteText = uniqueName("notes");
      await openProseMirrorEditor(game, sheetId, NOTES_PANE);
      await setProseMirrorText(game, sheetId, noteText, NOTES_PANE);
      await saveProseMirror(game, sheetId, NOTES_PANE);

      await waitForProseMirrorValue(game, {
        collection: "actors",
        id: actorId,
        fieldPath: NOTES_FIELD_PATH,
        text: noteText,
      });

      const pane = game.locator(`#${sheetId} ${NOTES_PANE}`);
      await expect(pane).toContainText(noteText);

      const newSheetId = await closeAndReopenActorSheet(game, actorId);
      await expect(game.locator(`#${newSheetId} ${NOTES_PANE}`)).toContainText(
        noteText,
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
