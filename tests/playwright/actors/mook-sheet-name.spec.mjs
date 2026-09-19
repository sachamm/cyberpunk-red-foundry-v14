import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  createMookViaUI,
  waitForMookFields,
  closeAndReopenMookSheet,
  openMookRenameDialog,
  setMookRenameValue,
  confirmMookRename,
  cancelMookRename,
  installConsoleErrorHarness,
} from "./mook-sheet-helpers.mjs";

/*
 * Token-backed rename is NOT covered here. Renaming a mook opened from a token on
 * canvas updates the token's name (not the base actor) via `this.actor.isToken` in
 * CPRMookActorSheet._changeMookName, but that path needs a placed token and the
 * canvas — disabled in this harness (core.noCanvas). Per the precedent in
 * rolls/speaker.spec.mjs it is verified live via the Playwright MCP instead. These
 * tests cover the headless-testable name behavior: plain rename persistence and
 * dialog dismissal.
 */

function nameLink(page, sheetId) {
  return page.locator(`#${sheetId} ${MOOK_FIELD.nameLink}`);
}

installConsoleErrorHarness();

test.describe("Side Pane (Name)", () => {
  test("renames the mook and persists after close/reopen", async ({
    page: game,
  }) => {
    const initialName = uniqueName("mook");
    let { actorId, sheetId } = await createMookViaUI(game, {
      name: initialName,
    });

    await test.step("header shows the initial name and opens a rename dialog", async () => {
      await expect(nameLink(game, sheetId)).toHaveText(initialName);
      const dialog = await openMookRenameDialog(game, sheetId);
      await expect(dialog.locator(MOOK_FIELD.dialogNameInput)).toHaveValue(
        initialName,
      );
      await cancelMookRename(dialog);
    });

    const newName = uniqueName("mook-renamed");
    await test.step("confirming a new name persists on a fresh render", async () => {
      const dialog = await openMookRenameDialog(game, sheetId);
      await setMookRenameValue(dialog, newName);
      await confirmMookRename(dialog);

      // Supporting evidence: the actor document's name was updated.
      await waitForMookFields(game, actorId, { name: newName });

      // Hard reopen -> prove it on the fresh render (visible proof).
      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(nameLink(game, sheetId)).toHaveText(newName);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("cancel / X on the rename dialog does not persist", async ({
    page: game,
  }) => {
    const initialName = uniqueName("mook");
    const { actorId, sheetId } = await createMookViaUI(game, {
      name: initialName,
    });

    await test.step("the cancel button discards the typed name", async () => {
      const dialog = await openMookRenameDialog(game, sheetId);
      await setMookRenameValue(dialog, uniqueName("mook-no-stick"));
      await cancelMookRename(dialog);
      await expect(nameLink(game, sheetId)).toHaveText(initialName);
    });

    await test.step("dismissing via Escape discards the typed name", async () => {
      const dialog = await openMookRenameDialog(game, sheetId);
      await setMookRenameValue(dialog, uniqueName("mook-no-stick"));
      await game.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
      await expect(nameLink(game, sheetId)).toHaveText(initialName);
    });

    // Supporting evidence: the actor document was never updated.
    await waitForMookFields(game, actorId, { name: initialName });
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
