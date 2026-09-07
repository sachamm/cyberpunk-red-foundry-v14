import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  createItemViaUI,
  closeDocSheet,
  dragItemToActorSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  createMookViaUI,
  ownedItemIdsByNames,
  closeAndReopenMookSheet,
} from "./mook-sheet-helpers.mjs";

/*
 * Drag an item of each Fight-pane type from the Items directory onto a mook sheet.
 * For a mook the drop is also the UI creation path: it embeds the item and
 * auto-equips equippables (handleMookDraggedItem), so a weapon/armor lands equipped
 * and renders in the always-visible fight block. This batch only proves the create +
 * drag flow — that each item shows up on the sheet after dragging, proven on a fresh
 * render. The Fight pane's own behaviors (fire modes, ablation, rolls, ...) live in
 * mook-sheet-fight.spec.mjs.
 */

// Fight-pane equippables and the row selector where each renders once equipped.
const FIGHT_ITEMS = [
  { type: "weapon", rowSelector: MOOK_FIELD.weaponRow },
  { type: "armor", rowSelector: MOOK_FIELD.armorRow },
];

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Drag and Drop", () => {
  for (const { type, rowSelector } of FIGHT_ITEMS) {
    test(`dragging a ${type} onto a mook shows it in the fight pane`, async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);

      const itemName = uniqueName(type);
      const itemId = await createItemViaUI(game, { type, name: itemName });
      // Close the item's sheet so it does not cover the drop target.
      await closeDocSheet(game, { collection: "items", id: itemId });

      await test.step(`dragging the ${type} onto the mook embeds it`, async () => {
        await dragItemToActorSheet(game, { itemId, sheetId, actorId });
      });

      const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
      const embeddedId = ids[itemName];
      expect(
        embeddedId,
        `the ${type} should be embedded on the mook`,
      ).toBeTruthy();

      await test.step(`the ${type} renders in the fight pane on a fresh render`, async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await expect(
          game.locator(
            `#${sheetId} ${rowSelector}[data-item-id="${embeddedId}"]`,
          ),
        ).toBeVisible();
      });
    });
  }
});
