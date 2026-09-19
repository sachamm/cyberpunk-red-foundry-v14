import { test, expect } from "@playwright/test";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  openProseMirrorEditor,
  reopenActorSheetViaUI,
  saveProseMirror,
  setProseMirrorText,
  uniqueName,
  waitForProseMirrorValue,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createMookViaUI,
  installConsoleErrorHarness,
} from "./mook-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Limited Permission View. A non-GM user who only has LIMITED ownership of a mook gets
 * a reduced sheet (cpr-mook-sheet-limited.hbs) that renders just the portrait, name, and
 * notes — every detail pane (stats/HP, fight block, skills, special gear, cyberware,
 * critical injuries) is simply not rendered. The GM seeds the mook's name + notes through
 * the full sheet, grants the harness player LIMITED ownership, then opens the same mook as
 * that player and proves only the limited surface shows while the detail panes are absent.
 */

const NOTES_PANE = ".mook-notes-content prose-mirror";
const NOTES_FIELD_PATH = "system.information.notes";

test.describe("Limited Permission View", () => {
  test("a LIMITED-permission player sees only the mook's portrait, name, and notes", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    const mookName = uniqueName("limited-mook");
    const noteText = uniqueName("notes");
    const { actorId, sheetId } = await createMookViaUI(game, {
      name: mookName,
    });

    await test.step("the GM seeds the mook's notes through the full sheet", async () => {
      await openProseMirrorEditor(game, sheetId, NOTES_PANE);
      await setProseMirrorText(game, sheetId, noteText, NOTES_PANE);
      await saveProseMirror(game, sheetId, NOTES_PANE);
      await waitForProseMirrorValue(game, {
        collection: "actors",
        id: actorId,
        fieldPath: NOTES_FIELD_PATH,
        text: noteText,
      });
      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    const playerId = await game.evaluate(
      () => game.users.getName("E2E Player")?.id ?? null,
    );
    expect(playerId, "the harness player should exist").toBeTruthy();

    await test.step("granting the player LIMITED ownership marks the mook limited", async () => {
      await game.evaluate(
        async ({ actorId, playerId }) => {
          const actor = game.actors.get(actorId);
          await actor.update({
            [`ownership.${playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
          });
        },
        { actorId, playerId },
      );
    });

    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      let limitedSheetId;
      await test.step("the player opens the mook from their directory", async () => {
        limitedSheetId = await reopenActorSheetViaUI(player, actorId);
      });

      await test.step("the limited sheet shows portrait, name, and notes", async () => {
        const root = player.locator(`#${limitedSheetId}`);
        await expect(root.locator(".mook-sheet-limited")).toBeVisible();
        await expect(
          root.locator(".mook-name-limited .text-largest"),
        ).toHaveText(mookName);
        await expect(root.locator("img.mook-image-block-img")).toBeVisible();
        await expect(root.locator(".mook-notes-limited")).toContainText(
          noteText,
        );
      });

      await test.step("every detail pane is absent", async () => {
        const root = player.locator(`#${limitedSheetId}`);
        for (const selector of [
          ".mook-sheet",
          ".mook-stats-and-derived",
          ".mook-gear",
          ".mook-skills",
          ".mook-special",
          ".mook-crit",
        ]) {
          await expect(root.locator(selector), selector).toHaveCount(0);
        }
      });

      await test.step("the player's view of the mook is limited (supporting)", async () => {
        const limited = await player.evaluate(
          (id) => game.actors.get(id).limited,
          actorId,
        );
        expect(limited).toBe(true);
      });
    } finally {
      await context.close();
    }
  });
});
