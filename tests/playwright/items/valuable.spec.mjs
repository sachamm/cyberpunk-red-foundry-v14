import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeDocSheet,
  closeOwnedItemSheet,
  createInventoryItemViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  enablePlayersCreateInventory,
  openOwnedItemSettings,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import { createCharacterViaUI } from "../actors/character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Valuable mixin: the price field and the category derived from it.
 *
 * - The Settings tab renders one editable price input (system.price.market,
 *   schema default 100) beside a read-only category span whose label is
 *   derived from the persisted price via cprGetPriceCategory; an edit commits
 *   to the document and the derived category follows it across a full sheet
 *   reopen.
 * - The same contract holds on a non-weapon valuable type (netarch), reached
 *   by dragging a world item onto the character.
 */

// The valuable section's rows on the Settings tab: the editable price input
// and the read-only category span derived from it.
async function priceRows(page, settings) {
  const categoryLabel = await page.evaluate(() =>
    game.i18n.localize("CPR.itemSheet.physical.price.category"),
  );
  const categoryRow = settings.locator("li.item").filter({
    has: page.getByText(categoryLabel, { exact: true }),
  });
  return {
    priceInput: settings.locator('input[name="system.price.market"]'),
    categoryRow,
    categoryValue: categoryRow.locator(".setting-value span.text-flex-end"),
  };
}

test.describe("Item valuable mixin", () => {
  test("price persists through the sheet and the category derives from it", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // A weapon at its schema defaults: price 100, the "premium" tier.
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: uniqueName("pistol"),
    });

    let itemSheetId;
    let settings;

    await test.step("the default price renders with its derived category", async () => {
      ({ itemSheetId, settings } = await openOwnedItemSettings(page, {
        actorId,
        itemId: weapon.itemId,
        sheetId,
      }));
      const { priceInput, categoryRow, categoryValue } = await priceRows(
        page,
        settings,
      );
      await expect(priceInput).toHaveValue("100");
      await expect(categoryRow).toHaveCount(1);
      await expect(categoryValue).toHaveText("Premium");
    });

    await test.step("editing the price persists and re-derives the category", async () => {
      await setItemField(page, {
        sheetId: itemSheetId,
        itemId: weapon.itemId,
        actorId,
        name: "system.price.market",
        path: "system.price.market",
        value: 5000,
      });

      // Reopen from the gear row so the assertions read persisted data.
      await closeOwnedItemSheet(page, { actorId, itemId: weapon.itemId });
      ({ itemSheetId, settings } = await openOwnedItemSettings(page, {
        actorId,
        itemId: weapon.itemId,
        sheetId,
      }));
      const { priceInput, categoryValue } = await priceRows(page, settings);
      await expect(priceInput).toHaveValue("5000");
      await expect(categoryValue).toHaveText("Luxury");
      await closeOwnedItemSheet(page, { actorId, itemId: weapon.itemId });
    });

    await test.step("the same contract holds for a dragged-in netarch", async () => {
      const name = uniqueName("netarch");
      const itemId = await createItemViaUI(page, { type: "netarch", name });
      await closeDocSheet(page, { collection: "items", id: itemId });
      await dragItemToActorSheet(page, { itemId, sheetId, actorId });

      const embeddedId = await page.evaluate(
        ({ actorId, name }) =>
          game.actors.get(actorId).items.find((i) => i.name === name)?.id ??
          null,
        { actorId, name },
      );
      expect(
        embeddedId,
        "the netarch should be embedded on the character",
      ).toBeTruthy();

      const opened = await openOwnedItemSettings(page, {
        actorId,
        itemId: embeddedId,
        sheetId,
      });
      let rows = await priceRows(page, opened.settings);
      await expect(rows.priceInput).toHaveValue("100");
      await expect(rows.categoryValue).toHaveText("Premium");

      await setItemField(page, {
        sheetId: opened.itemSheetId,
        itemId: embeddedId,
        actorId,
        name: "system.price.market",
        path: "system.price.market",
        value: 20,
      });
      await closeOwnedItemSheet(page, { actorId, itemId: embeddedId });

      const reopened = await openOwnedItemSettings(page, {
        actorId,
        itemId: embeddedId,
        sheetId,
      });
      rows = await priceRows(page, reopened.settings);
      await expect(rows.priceInput).toHaveValue("20");
      await expect(rows.categoryValue).toHaveText("Everyday");
      await closeOwnedItemSheet(page, { actorId, itemId: embeddedId });
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });
});
