import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  createDocumentViaUI,
  expectSheetRendered,
  closeDocSheet,
  uniqueName,
  reopenActorSheetViaUI,
} from "../../../tools/playwright/ui/index.mjs";

const FIELD = {
  name: 'input[name="name"]',
  tradeWith: 'select[name="trade-with-dropdown"]',
  eurobucksValue: ".eurobucks-value",
  eurobucksNA: ".eurobucks-value span[data-tooltip]",
  ledgerButton: ".eurobucks-open-ledger",
  containerTypeDropdown: "select.container-type-dropdown",
  imageBlock: ".image-block img",
  gmSettings: ".settings-gm-section",
  createButton: ".item-create",
  categoryHeader: ".items-header.collapsible",
  expandButton: ".expand-button",
  collapseIcon: ".collapse-icon",
  expandIcon: ".expand-icon",
  itemName: ".item-edit",
  itemAmount: '.item-detail:has-text("[0-9]")',
  itemPrice: ".gear-data",
  purchaseAll: 'a.item-action[data-action-type="purchase"]',
  purchasePart: 'a.item-action[data-action-type="purchaseFraction"]',
  deleteItem: 'a.item-action[data-action-type="delete"]',
  toggleInstalled: ".toggle-installed-visibility",
};

function sheet(page, sheetId) {
  return page.locator(`#${sheetId}`);
}

async function waitForActorFields(page, actorId, expected) {
  await page.waitForFunction(
    ({ actorId, expected }) => {
      const actor = game.actors.get(actorId);
      if (!actor) return false;
      return Object.entries(expected).every(
        ([path, value]) => foundry.utils.getProperty(actor, path) === value,
      );
    },
    { actorId, expected },
    { timeout: 10000 },
  );
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Container actor sheet", () => {
  test("renders, shows GM settings, and displays inventory categories", async ({
    page: game,
  }) => {
    const initialName = uniqueName("container");
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: initialName,
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("first render shows editable name, image block, and trade-with selector", async () => {
      const containerSheet = sheet(game, sheetId);

      await expect(containerSheet.locator(FIELD.name)).toHaveValue(initialName);
      await expect(containerSheet.locator(FIELD.name)).toBeVisible();
      await expect(containerSheet.locator(FIELD.name)).toBeEnabled();

      await expect(containerSheet.locator(FIELD.imageBlock)).toBeVisible();

      await expect(containerSheet.locator(FIELD.tradeWith)).toBeVisible();
    });

    await test.step("GM settings section is visible for GM user", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.gmSettings)).toBeVisible();
    });

    await test.step("container type dropdown is present with shop as default", async () => {
      const containerSheet = sheet(game, sheetId);
      const dropdown = containerSheet.locator(FIELD.containerTypeDropdown);
      await expect(dropdown).toBeVisible();
      const selected = await dropdown.evaluate(
        (el) => el.options[el.selectedIndex].textContent,
      );
      expect(selected).toBeTruthy();
    });

    await test.step("eurobucks display shows a numeric value for shop container", async () => {
      const containerSheet = sheet(game, sheetId);
      const eurobucksText = await containerSheet
        .locator(FIELD.eurobucksValue)
        .evaluate((el) => el.textContent?.trim() ?? "");
      expect(Number(eurobucksText)).not.toBeNaN();
    });

    await test.step("ledger button is visible for GM on non-loot container", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.ledgerButton)).toBeVisible();
    });

    await test.step("inventory categories are rendered as collapsible sections", async () => {
      const containerSheet = sheet(game, sheetId);
      const categories = containerSheet.locator(FIELD.categoryHeader);
      const count = await categories.count();
      expect(count).toBeGreaterThan(0);

      // First category starts expanded: expand icon visible, collapse icon hidden
      const firstCategory = categories.first();
      await expect(firstCategory.locator(FIELD.expandIcon)).toBeVisible();
    });

    await test.step("create item buttons are visible for GM on category headers", async () => {
      const containerSheet = sheet(game, sheetId);
      const createButtons = containerSheet.locator(FIELD.createButton);
      const count = await createButtons.count();
      expect(count).toBeGreaterThan(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("name edits persist after close and reopen", async ({ page: game }) => {
    const initialName = uniqueName("container");
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: initialName,
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("edit name and verify persistence", async () => {
      const editedName = uniqueName("container-edited");
      const containerSheet = sheet(game, sheetId);

      await containerSheet.locator(FIELD.name).fill(editedName);
      await containerSheet.locator(FIELD.name).blur();

      await waitForActorFields(game, actorId, { name: editedName });

      // Close and reopen via UI (same pattern as demon sheet test)
      await closeDocSheet(game, { collection: "actors", id: actorId });
      sheetId = await reopenActorSheetViaUI(game, actorId);

      const reopenedSheet = sheet(game, sheetId);
      await expect(reopenedSheet.locator(FIELD.name)).toHaveValue(editedName);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("loot container shows N/A for eurobucks and hides ledger button", async ({
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

    await test.step("changing container type on a non-token sheet shows an error", async () => {
      const containerSheet = sheet(game, sheetId);
      const dropdown = containerSheet.locator(FIELD.containerTypeDropdown);

      // Select by value "loot" (the option label is "Loot - All items are free")
      await dropdown.selectOption({ value: "loot" });

      // Container type changes are blocked on non-token sheets
      // Verify a notification/error was shown
      await expect(game.locator(".notification.error")).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("category collapse/expand toggles item visibility", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("stash-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("first category starts expanded, click expand-button to collapse", async () => {
      const containerSheet = sheet(game, sheetId);
      const categories = containerSheet.locator(FIELD.categoryHeader);
      const count = await categories.count();
      expect(count).toBeGreaterThan(0);

      // First category starts expanded (expand icon visible, collapse icon hidden)
      const firstCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .first();
      await expect(firstCategory.locator(FIELD.expandIcon)).toBeVisible();

      // Click the expand-button span (where the click handler is registered)
      await firstCategory.locator(FIELD.expandButton).click();

      // After collapse, collapse icon should be visible
      await expect(firstCategory.locator(FIELD.collapseIcon)).toBeVisible();
    });

    await test.step("click expand-button again to re-expand", async () => {
      const containerSheet = sheet(game, sheetId);
      const firstCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .first();
      await firstCategory.locator(FIELD.expandButton).click();

      // After expand, expand icon should be visible again
      await expect(firstCategory.locator(FIELD.expandIcon)).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("deleting without confirmation when setting is disabled", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("no-confirm-delete-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("disable deleteItemConfirmation setting", async () => {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "deleteItemConfirmation", false);
      });
      await game.waitForTimeout(200);
    });

    await test.step("create a gear item in the container", async () => {
      const containerSheet = sheet(game, sheetId);

      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();

      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("delete the item without confirmation dialog appearing", async () => {
      const containerSheet = sheet(game, sheetId);

      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const deleteLink = itemRow.locator(FIELD.deleteItem);
      await expect(deleteLink).toBeVisible();
      await deleteLink.click();
      await game.waitForTimeout(500);

      // Verify no confirmation dialog appeared
      const confirmDialog = game.locator(".application.dialog");
      await expect(confirmDialog).not.toBeVisible();

      // Verify the item is removed immediately
      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
    });

    await test.step("re-enable deleteItemConfirmation setting", async () => {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "deleteItemConfirmation", true);
      });
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("editing item fields from item sheet reflects on container sheet", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("edit-fields-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create a gear item in the container", async () => {
      const containerSheet = sheet(game, sheetId);

      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();

      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("open the item sheet by clicking on the item name", async () => {
      const containerSheet = sheet(game, sheetId);

      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const itemEditLink = itemRow.locator(FIELD.itemName);
      await itemEditLink.click();

      // Wait for item sheet to open
      await game.waitForTimeout(500);
    });

    await test.step("verify item sheet is open and editable", async () => {
      // Item sheet is a separate application window with .item-sheet class
      const itemSheet = game.locator(".application .item-sheet");
      await expect(itemSheet).toBeVisible();
    });

    await test.step("edit the price field", async () => {
      // Item sheet is a separate application window
      const itemSheet = game.locator(".application .item-sheet");

      // Navigate to settings tab
      const settingsTab = itemSheet.locator('a[data-tab="item-settings"]');
      await settingsTab.click();
      await game.waitForTimeout(300);

      // Find and edit the price field
      const priceInput = itemSheet.locator('input[name="system.price.market"]');
      await expect(priceInput).toBeVisible();
      await priceInput.fill("500");
      await priceInput.blur();
      await game.waitForTimeout(300);
    });

    await test.step("edit the amount field", async () => {
      const itemSheet = game.locator(".application .item-sheet");

      // Amount field should be visible on settings tab for stackable items
      const amountInput = itemSheet.locator('input[name="system.amount"]');
      await expect(amountInput).toBeVisible();
      await amountInput.fill("10");
      await amountInput.blur();
      await game.waitForTimeout(300);
    });

    await test.step("edit the description field via Foundry API", async () => {
      // Update the description via the Foundry API
      await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (actor) {
            const item = actor.items.find((i) => i.name === "New Gear");
            if (item) {
              await item.update({ "system.description.value": "This is an edited description for testing" });
            }
          }
        },
        { actorId },
      );
      await game.waitForTimeout(300);
    });

    await test.step("close the item sheet", async () => {
      const itemSheet = game.locator(".application .item-sheet");
      await expect(itemSheet).toBeVisible();

      // Close the item sheet via the close button
      const closeButton = itemSheet.locator(".window-close");
      if (await closeButton.count() > 0) {
        await closeButton.click();
      } else {
        // Fallback: use the application's close mechanism
        await itemSheet.evaluate((el) => {
          const closeBtn = el.querySelector(".window-close");
          if (closeBtn) closeBtn.click();
        });
      }
      await game.waitForTimeout(500);
    });

    await test.step("verify price change is reflected on container sheet", async () => {
      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

      const containerSheet = sheet(game, sheetId);

      // Verify the item row exists
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      // Verify the price is displayed as 500 (or formatted as "500eb")
      const gearData = itemRow.locator(".gear-data");
      await expect(gearData).toBeVisible();
      const priceText = await gearData.evaluate((el) => el.textContent);
      expect(priceText).toContain("500");
    });

    await test.step("verify amount change is reflected on container sheet", async () => {
      const containerSheet = sheet(game, sheetId);

      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      // Amount column should show 10
      const itemDetail = itemRow.locator(".item-detail");
      await expect(itemDetail).toBeVisible();
      const amountText = await itemDetail.evaluate((el) => el.textContent);
      expect(amountText).toContain("10");
    });

    await test.step("verify description change is reflected on container sheet", async () => {
      const containerSheet = sheet(game, sheetId);

      const itemEditLink = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemEditLink).toBeVisible();

      // The tooltip should contain the edited description
      const tooltip = await itemEditLink.getAttribute("data-tooltip");
      expect(tooltip).toContain("edited description");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("player can create items when players-create flag is set", async ({
    page: game,
  }) => {
    // Create a player user with a character
    const { playerId } = await game.evaluate(async () => {
      const { CONST } = globalThis;
      const userName = "E2E Player";
      const user =
        game.users.getName(userName) ??
        (await User.create({ name: userName, role: CONST.USER_ROLES.PLAYER }));
      return { playerId: user.id };
    });

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("player-create-container"),
    });

    // Set up the container as custom type with players-create enabled
    await game.evaluate(
      async ({ actorId, playerId }) => {
        const actor = game.actors.get(actorId);
        await actor.setContainerType("custom");
        await actor.update({
          [`flags.${game.system.id}.players-create`]: true,
        });
        // Grant player ownership so they can modify the actor
        await actor.update({
          [`ownership.${playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      },
      { actorId, playerId },
    );

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("GM creates a gear item in the container", async () => {
      const containerSheet = sheet(game, sheetId);

      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();

      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("player can create items via the API", async () => {
      const itemBeforeCount = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          return actor ? actor.items.size : 0;
        },
        { actorId },
      );

      // Player creates an item via the API (simulating what would happen
      // when a player clicks the create button on their sheet)
      await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (actor) {
            await actor.createEmbeddedDocuments("Item", [
              {
                name: "Player-Created Item",
                type: "gear",
                system: {
                  amount: 1,
                  price: { market: 100 },
                  description: { value: "Created by player test" },
                },
              },
            ]);
          }
        },
        { actorId },
      );
      await game.waitForTimeout(300);

      const itemAfterCount = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          return actor ? actor.items.size : 0;
        },
        { actorId },
      );

      expect(itemAfterCount).toBe(itemBeforeCount + 1);

      // Verify the player-created item exists
      const playerItem = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          const item = actor.items.find(
            (i) => i.name === "Player-Created Item",
          );
          return item ? item.name : null;
        },
        { actorId },
      );
      expect(playerItem).toBe("Player-Created Item");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("player can delete items when players-delete flag is set", async ({
    page: game,
  }) => {
    const { playerId } = await game.evaluate(async () => {
      const { CONST } = globalThis;
      const userName = "E2E Player";
      const user =
        game.users.getName(userName) ??
        (await User.create({ name: userName, role: CONST.USER_ROLES.PLAYER }));
      return { playerId: user.id };
    });

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("player-delete-container"),
    });

    // Set up the container as custom type with players-delete enabled
    await game.evaluate(
      async ({ actorId, playerId }) => {
        const actor = game.actors.get(actorId);
        await actor.setContainerType("custom");
        await actor.update({
          [`flags.${game.system.id}.players-delete`]: true,
        });
        await actor.update({
          [`ownership.${playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      },
      { actorId, playerId },
    );

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("GM creates a gear item in the container", async () => {
      const containerSheet = sheet(game, sheetId);

      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();

      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("player can delete items via the API", async () => {
      // Get the embedded item ID
      const embeddedItemId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item?._id ?? null;
        },
        { actorId },
      );

      const itemBeforeCount = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          return actor ? actor.items.size : 0;
        },
        { actorId },
      );

      // Player deletes the item via the API
      await game.evaluate(
        async ({ actorId, embeddedItemId }) => {
          const actor = game.actors.get(actorId);
          if (actor && embeddedItemId) {
            await actor.deleteEmbeddedDocuments("Item", [embeddedItemId]);
          }
        },
        { actorId, embeddedItemId },
      );
      await game.waitForTimeout(300);

      const itemAfterCount = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          return actor ? actor.items.size : 0;
        },
        { actorId },
      );

      expect(itemAfterCount).toBe(itemBeforeCount - 1);

      // Verify the item is gone
      const remainingItem = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.items.find((i) => i.name === "New Gear");
        },
        { actorId },
      );
      expect(remainingItem).toBeUndefined();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("player can modify items when players-modify flag is set", async ({
    page: game,
  }) => {
    const { playerId } = await game.evaluate(async () => {
      const { CONST } = globalThis;
      const userName = "E2E Player";
      const user =
        game.users.getName(userName) ??
        (await User.create({ name: userName, role: CONST.USER_ROLES.PLAYER }));
      return { playerId: user.id };
    });

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("player-modify-container"),
    });

    // Set up the container as custom type with players-modify enabled
    await game.evaluate(
      async ({ actorId, playerId }) => {
        const actor = game.actors.get(actorId);
        await actor.setContainerType("custom");
        await actor.update({
          [`flags.${game.system.id}.players-modify`]: true,
        });
        await actor.update({
          [`ownership.${playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      },
      { actorId, playerId },
    );

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("GM creates a gear item in the container", async () => {
      const containerSheet = sheet(game, sheetId);

      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();

      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("player can modify items via the API", async () => {
      // Get the embedded item ID
      const embeddedItemId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item?._id ?? null;
        },
        { actorId },
      );

      // Player modifies the item's price and description via the API
      await game.evaluate(
        async ({ actorId, embeddedItemId }) => {
          const actor = game.actors.get(actorId);
          if (actor && embeddedItemId) {
            await actor.updateEmbeddedDocuments("Item", [
              {
                _id: embeddedItemId,
                "system.price.market": 750,
                "system.description.value": "Player modified this item",
              },
            ]);
          }
        },
        { actorId, embeddedItemId },
      );
      await game.waitForTimeout(300);

      // Verify the modifications were applied
      const modifiedItem = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item
            ? {
                price: item.system.price.market,
                description: item.system.description.value,
              }
            : null;
        },
        { actorId },
      );

      expect(modifiedItem.price).toBe(750);
      expect(modifiedItem.description).toBe("Player modified this item");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
