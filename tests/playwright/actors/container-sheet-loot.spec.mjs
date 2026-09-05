import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  createDocumentViaUI,
  expectSheetRendered,
  openTokenSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createContainerWithItem,
  FIELD,
  installConsoleErrorHarness,
  setContainerTypeViaUI,
  sheet,
} from "./container-sheet-helpers.mjs";

installConsoleErrorHarness();

test.describe("Loot", () => {
  test("loot containers show N/A for eurobucks and hide the ledger button", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("loot-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("loot container displays N/A for eurobucks on token sheet", async () => {
      sheetId = await setContainerTypeViaUI(game, actorId, "loot");

      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.eurobucksNA)).toBeVisible();
    });

    await test.step("loot container hides ledger button", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.ledgerButton)).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("loot items show a take button instead of purchase", async ({
    page: game,
  }) => {
    const { actorId } = await createContainerWithItem(game, {
      containerName: "loot-take-button-container",
      itemType: "gear",
    });

    let sheetId = await openTokenSheet(game, actorId);

    await test.step("switch to loot type and verify hand icon", async () => {
      // Setting the type to loot via the dropdown also sets items-free as a
      // side effect (see setContainerType), which is what shows the take
      // button; there is no checkbox for it on loot containers.
      sheetId = await setContainerTypeViaUI(game, actorId, "loot");

      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const purchaseBtn = itemRow.locator(
        'a.item-action[data-action-type="purchase"] i',
      );
      await expect(purchaseBtn).toBeVisible();
      await expect(purchaseBtn).toHaveClass(/fa-hand/);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
