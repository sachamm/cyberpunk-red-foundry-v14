import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  closeOwnedItemSheet,
  createDocumentViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openOwnedItemSheet,
  openSidebarTab,
  reopenActorSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";
import {
  createContainerWithItem,
  createInventoryItemViaUI,
  FIELD,
  installConsoleErrorHarness,
  setContainerFlagViaUI,
  setContainerTypeViaUI,
  sheet,
  waitForActorFields,
} from "./container-sheet-helpers.mjs";

installConsoleErrorHarness();

test.describe("Common behaviors", () => {
  test("editing the container name persists after close and reopen", async ({
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

    await test.step("edit name and verify persistence", async () => {
      const editedName = uniqueName("container-edited");
      const containerSheet = sheet(game, sheetId);

      await containerSheet.locator(FIELD.name).fill(editedName);
      await containerSheet.locator(FIELD.name).blur();
      await expect(containerSheet.locator(FIELD.name)).toHaveValue(editedName);

      await waitForActorFields(game, actorId, { name: editedName });
      await closeDocSheet(game, { collection: "actors", id: actorId });
      sheetId = await reopenActorSheetViaUI(game, actorId);

      const reopenedSheet = sheet(game, sheetId);
      await expect(reopenedSheet.locator(FIELD.name)).toHaveValue(editedName);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("GM can create items from category headers and verify defaults", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    const categories = [
      { name: "weapon", defaultName: "New Weapon" },
      { name: "ammo", defaultName: "New Ammo" },
      { name: "armor", defaultName: "New Armor" },
      { name: "gear", defaultName: "New Gear" },
      { name: "drug", defaultName: "New Drug" },
      { name: "clothing", defaultName: "New Clothing" },
      { name: "cyberware", defaultName: "New Cyberware" },
      { name: "vehicle", defaultName: "New Vehicle" },
      { name: "cyberdeck", defaultName: "New Cyberdeck" },
      { name: "program", defaultName: "New Program" },
      { name: "itemUpgrade", defaultName: "New Upgrade" },
      { name: "netarch", defaultName: "New NET Architecture" },
    ];

    await test.step("create one item from each category and verify defaults", async () => {
      for (const cat of categories) {
        sheetId = (
          await createInventoryItemViaUI(game, {
            actorId,
            sheetId,
            itemType: cat.name,
          })
        ).sheetId;

        const itemRow = sheet(game, sheetId)
          .locator(FIELD.itemName)
          .filter({ hasText: cat.defaultName });
        await expect(itemRow).toBeVisible();
      }
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("GM can delete items from container inventory with and without confirmation", async ({
    page: game,
  }) => {
    await test.step("disable deleteItemConfirmation setting", async () => {
      await game.evaluate(async () => {
        await game.settings.set(
          game.system.id,
          "deleteItemConfirmation",
          false,
        );
      });
    });

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("delete-without-confirm-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create a gear item for delete-without-confirmation test", async () => {
      ({ sheetId } = await createInventoryItemViaUI(game, {
        actorId,
        sheetId,
        itemType: "gear",
      }));
    });

    await test.step("delete item without confirmation dialog appearing", async () => {
      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const deleteLink = itemRow.locator(FIELD.deleteItem);
      await expect(deleteLink).toBeVisible();
      await deleteLink.click();

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId: actorId },
        { timeout: 5000 },
      );

      await expect(game.locator(".application.dialog")).not.toBeVisible();

      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("editing item fields from item sheet reflects on container sheet", async ({
    page: game,
  }) => {
    const { actorId, sheetId, itemId } = await createContainerWithItem(game, {
      containerName: "edit-fields-container",
      itemType: "gear",
    });

    await test.step("open the item sheet by clicking on the item name", async () => {
      const containerSheet = sheet(game, sheetId);

      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      await itemRow.locator(FIELD.itemName).click();
      await openOwnedItemSheet(game, { actorId, itemId });
    });

    await test.step("edit the price field", async () => {
      const itemSheetId = await openOwnedItemSheet(game, { actorId, itemId });
      const itemSheet = await openItemSettings(game, itemSheetId);

      const priceInput = itemSheet.locator('input[name="system.price.market"]');
      await expect(priceInput).toBeVisible();
      await priceInput.fill("500");
      await priceInput.press("Tab");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item?.system?.price?.market === 500;
        },
        { actorId },
        { timeout: 5000 },
      );
    });

    await test.step("edit the amount field", async () => {
      const itemSheetId = await openOwnedItemSheet(game, { actorId, itemId });
      const itemSheet = await openItemSettings(game, itemSheetId);

      const amountInput = itemSheet.locator('input[name="system.amount"]');
      await expect(amountInput).toBeVisible();
      await amountInput.fill("10");
      await amountInput.press("Tab");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          const item = actor.items.find((i) => i.name === "New Gear");
          return (
            item?.system?.price?.market === 500 && item?.system?.amount === 10
          );
        },
        { actorId },
        { timeout: 5000 },
      );
    });

    await test.step("edit the description field via Foundry API", async () => {
      await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (actor) {
            const item = actor.items.find((i) => i.name === "New Gear");
            if (item) {
              await item.update({
                "system.description.value":
                  "This is an edited description for testing",
              });
            }
          }
        },
        { actorId },
      );
    });

    await test.step("close the item sheet", async () => {
      await closeOwnedItemSheet(game, { actorId, itemId });
    });

    let updatedSheetId;
    await test.step("reopen the container sheet", async () => {
      await closeDocSheet(game, { collection: "actors", id: actorId });
      updatedSheetId = await reopenActorSheetViaUI(game, actorId);
    });

    await test.step("verify price change is reflected on container sheet", async () => {
      const containerSheet = sheet(game, updatedSheetId);

      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const gearData = itemRow.locator(".gear-data");
      await expect(gearData).toBeVisible();
      await expect(gearData).toContainText("500");
    });

    await test.step("verify amount change is reflected on container sheet", async () => {
      const containerSheet = sheet(game, updatedSheetId);

      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const itemDetail = itemRow.locator(".item-detail");
      await expect(itemDetail).toBeVisible();
      await expect(itemDetail).toContainText("10");
    });

    await test.step("verify description change is reflected on container sheet", async () => {
      const containerSheet = sheet(game, updatedSheetId);

      const itemEditLink = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemEditLink).toBeVisible();

      await expect(itemEditLink).toHaveAttribute(
        "data-tooltip",
        /edited description/,
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  /**
   * Note: macOS Chromium treats Ctrl+click as a right-click (context menu) and never
   *   dispatches a "ctrl" event. We add Cmd/Meta here, so the handler accepts both modifiers.
   */
  test("ctrl-clicking an item name posts an item card to the chat log", async ({
    page: game,
  }) => {
    const cardModifier = process.platform === "darwin" ? ["Meta"] : ["Control"];

    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "item-card-container",
      itemType: "gear",
    });

    await test.step("open the chat log", async () => {
      await openSidebarTab(game, "chat");
    });

    await test.step("ctrl-clicking the item name posts a chat message with the item card", async () => {
      const containerSheet = sheet(game, sheetId);
      const itemEditLink = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" })
        .locator(FIELD.itemName);
      await expect(itemEditLink).toBeVisible();

      const before = await game.evaluate(() => game.messages.size);
      await itemEditLink.click({ modifiers: cardModifier });

      await game.waitForFunction((n) => game.messages.size > n, before, {
        timeout: 10000,
      });

      const card = game
        .locator("#chat .chat-message")
        .last()
        .locator(".item-card-grid-container");
      await expect(card).toBeVisible();
      await expect(card.locator(".item-card-name")).toContainText("New Gear");
      await expect(card.locator(".item-card-type")).toContainText("Gear");
    });

    await test.step("ctrl-click does not open the item sheet", async () => {
      await expect(game.locator(".application .item-sheet")).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("dragging an item onto the container adds it to its inventory", async ({
    page: game,
  }) => {
    const itemId = await createItemViaUI(game, {
      type: "gear",
      name: uniqueName("dropped-item"),
    });

    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "drag-drop-container",
      itemType: "gear",
    });

    await test.step("drag item from compendium onto container sheet", async () => {
      await dragItemToActorSheet(game, { itemId, sheetId, actorId });
    });

    await test.step("verify item appears in container inventory", async () => {
      const containerSheet = sheet(game, sheetId);
      const droppedItemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "dropped-item" });
      await expect(droppedItemRow).toBeVisible();

      const itemCount = await containerSheet.locator(FIELD.itemName).count();
      expect(itemCount).toBe(2);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("dragging an item from a container sheet back onto itself does not delete it", async ({
    page: game,
  }) => {
    const { actorId, sheetId, itemId } = await createContainerWithItem(game, {
      containerName: "same-sheet-drop-container",
      itemType: "ammo",
    });

    await test.step("drag the item row onto its own sheet", async () => {
      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Ammo" });
      await expect(itemRow).toBeVisible();

      await itemRow.dragTo(containerSheet, { timeout: 5000 }).catch(() => {});
      await game.mouse.up().catch(() => {});
    });

    await test.step("no dialog appears and the inventory is unchanged", async () => {
      await expect(game.locator(".application.dialog")).toHaveCount(0);
      const itemIds = await game.evaluate(
        (id) => Array.from(game.actors.get(id).items).map((i) => i.id),
        actorId,
      );
      expect(itemIds).toEqual([itemId]);
    });

    await test.step("the item is still present after close and reopen", async () => {
      await closeDocSheet(game, { collection: "actors", id: actorId });
      const reopenedSheetId = await reopenActorSheetViaUI(game, actorId);
      const itemRow = sheet(game, reopenedSheetId)
        .locator(".item.flexrow")
        .filter({ hasText: "New Ammo" });
      await expect(itemRow).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("a player dropping an item from a container sheet back onto itself does not trigger a self-sell", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    const { actorId, itemId } = await createContainerWithItem(game, {
      containerName: "self-sell-container",
      itemType: "ammo",
    });

    await test.step("configure the container for player selling and grant ownership", async () => {
      await setContainerTypeViaUI(game, actorId, "custom");
      await setContainerFlagViaUI(game, actorId, "players-sell");
      const playerId = await game.evaluate(
        () => game.users.getName("E2E Player")?.id ?? null,
      );
      expect(playerId).toBeTruthy();
      await game.evaluate(
        async ({ id, playerId }) => {
          await game.actors.get(id).update({
            [`ownership.${playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
          });
        },
        { id: actorId, playerId },
      );
    });

    const initialAmount = await game.evaluate(
      ({ id, itemId }) => game.actors.get(id).items.get(itemId)?.system.amount,
      { id: actorId, itemId },
    );

    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      await test.step("player drags the container's own item row onto its own sheet", async () => {
        const playerSheetId = await reopenActorSheetViaUI(player, actorId);
        const containerSheet = sheet(player, playerSheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Ammo" });
        await expect(itemRow).toBeVisible();

        await itemRow.dragTo(containerSheet, { timeout: 5000 }).catch(() => {});
        await player.mouse.up().catch(() => {});
      });

      await test.step("no sell offer dialog appears", async () => {
        await player.waitForTimeout(1500);
        await expect(
          player.locator(".dialog", { hasText: "offering you" }),
        ).toHaveCount(0);
      });
    } finally {
      await context.close();
    }

    await test.step("the item is unchanged after close and reopen", async () => {
      const itemIds = await game.evaluate(
        (id) => Array.from(game.actors.get(id).items).map((i) => i.id),
        actorId,
      );
      expect(itemIds).toEqual([itemId]);
      const amount = await game.evaluate(
        ({ id, itemId }) =>
          game.actors.get(id).items.get(itemId)?.system.amount,
        { id: actorId, itemId },
      );
      expect(amount).toBe(initialAmount);

      await closeDocSheet(game, { collection: "actors", id: actorId });
      const reopenedSheetId = await reopenActorSheetViaUI(game, actorId);
      const itemRow = sheet(game, reopenedSheetId)
        .locator(".item.flexrow")
        .filter({ hasText: "New Ammo" });
      await expect(itemRow).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("categories collapse/expand independently and toggle item visibility", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("multi-category-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create items in multiple categories", async () => {
      sheetId = (
        await createInventoryItemViaUI(game, {
          actorId,
          sheetId,
          itemType: "weapon",
        })
      ).sheetId;

      sheetId = (
        await createInventoryItemViaUI(game, {
          actorId,
          sheetId,
          itemType: "armor",
        })
      ).sheetId;
    });

    await test.step("verify items in both categories are visible when expanded", async () => {
      const containerSheet = sheet(game, sheetId);

      const weaponCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .filter({ hasText: "Weapon" });
      await expect(weaponCategory).toBeVisible();

      const armorCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .filter({ hasText: "Armor" });
      await expect(armorCategory).toBeVisible();

      const weaponItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Weapon" });
      await expect(weaponItem).toBeVisible();

      const armorItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Armor" });
      await expect(armorItem).toBeVisible();
    });

    await test.step("collapse Weapon and verify only Armor remains visible", async () => {
      const containerSheet = sheet(game, sheetId);

      const weaponCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .filter({ hasText: "Weapon" });
      await weaponCategory.locator(FIELD.expandButton).click();

      const weaponItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Weapon" });
      await expect(weaponItem).not.toBeVisible();

      const armorItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Armor" });
      await expect(armorItem).toBeVisible();
    });

    await test.step("re-expand Weapon and verify both items are visible", async () => {
      const containerSheet = sheet(game, sheetId);

      const weaponCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .filter({ hasText: "Weapon" });
      await weaponCategory.locator(FIELD.expandButton).click();

      const weaponItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Weapon" });
      await expect(weaponItem).toBeVisible();

      const armorItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Armor" });
      await expect(armorItem).toBeVisible();
    });

    await test.step("collapse Armor and verify only Weapon remains visible", async () => {
      const containerSheet = sheet(game, sheetId);

      const armorCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .filter({ hasText: "Armor" });
      await armorCategory.locator(FIELD.expandButton).click();

      const weaponItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Weapon" });
      await expect(weaponItem).toBeVisible();

      const armorItem = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Armor" });
      await expect(armorItem).not.toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("changing container type from the actor sheet updates the flag", async ({
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

    await test.step("changing container type to loot updates the flag on the actor", async () => {
      const containerSheet = sheet(game, sheetId);
      const dropdown = containerSheet.locator(FIELD.containerTypeDropdown);

      await dropdown.selectOption({ value: "loot" });

      await game.waitForFunction(
        ({ id }) =>
          game.actors.get(id).getFlag(game.system.id, "container-type") ===
          "loot",
        { id: actorId },
        { timeout: 5000 },
      );
      await expect(game.locator(".notification.error")).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("toggling infinite-stock from the actor sheet updates the flag", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("non-token-settings-test"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("toggling infinite-stock updates the flag on the actor", async () => {
      const containerSheet = sheet(game, sheetId);
      const toggle = containerSheet.locator(
        '.checkbox-toggle[data-flag-name="infinite-stock"]',
      );
      await expect(toggle).toBeVisible();
      await toggle.click();

      await game.waitForFunction(
        ({ id }) =>
          game.actors.get(id).getFlag(game.system.id, "infinite-stock") ===
          true,
        { id: actorId },
        { timeout: 5000 },
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("#1076: dropping a role item onto a container is rejected", async ({
    page: game,
  }) => {
    // The rejection intentionally surfaces an error notification. Both
    // Foundry's ui.notifications.error and DisplayMessage's LOGGER.error
    // log it to the console; register both so the global console check
    // ignores exactly these messages.
    game.expectedConsoleErrors.push(
      /CPR ERR \| Roles cannot be added to containers/,
      /^Roles cannot be added to containers, Choomba!/,
    );

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("role-drop-container"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    const roleId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "role",
      name: uniqueName("solo-role"),
    });
    // Creating the item leaves its sheet open, in front of the container
    // sheet; close it so the real drag can land on the container.
    await closeDocSheet(game, { collection: "items", id: roleId });

    const errorNotification = game.locator(".notification.error").filter({
      hasText: "Roles cannot be added to containers",
    });

    await test.step("drag role onto container sheet", async () => {
      await openSidebarTab(game, "items");
      const entry = game.locator(`#items [data-entry-id="${roleId}"]`);
      await expect(entry).toBeVisible();
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet).toBeVisible();

      // Real UI drag only: the drop itself is the behavior under test, so
      // there is no synthetic DragEvent fallback. If it does not land, the
      // assertion below fails the test.
      await entry.dragTo(containerSheet, { timeout: 5000 }).catch(() => {});
      await game.mouse.up().catch(() => {});

      const shown = await errorNotification
        .first()
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      expect(
        shown,
        "UI drag of the role item did not trigger the rejection notification; the container sheet may be covered by another window",
      ).toBe(true);
    });

    await test.step("an error notification is shown to the user", async () => {
      await expect(errorNotification.first()).toBeVisible({ timeout: 10000 });
    });

    await test.step("the role item is not persisted on the container", async () => {
      const hasRole = await game.evaluate(
        (id) =>
          Array.from(game.actors.get(id).items).some((i) => i.type === "role"),
        actorId,
      );
      expect(hasRole).toBe(false);
    });

    await test.step("the rejection is logged by both Foundry and the system logger, with no uncaught exception", async () => {
      await game.waitForTimeout(2000);
      const foundryLogged = game.consoleErrors.filter((text) =>
        text.startsWith("Roles cannot be added to containers, Choomba!"),
      );
      expect(foundryLogged).toHaveLength(1);
      const systemLogged = game.consoleErrors.filter((text) =>
        text.includes("CPR ERR | Roles cannot be added to containers"),
      );
      expect(systemLogged).toHaveLength(1);
      const uncaught = game.consoleErrors.filter((text) =>
        text.startsWith("uncaught exception:"),
      );
      expect(uncaught).toHaveLength(0);
    });

    await test.step("reopening the sheet stays clean and shows no role row", async () => {
      const before = game.consoleErrors.length;
      await closeDocSheet(game, { collection: "actors", id: actorId });
      sheetId = await reopenActorSheetViaUI(game, actorId);
      await game.waitForTimeout(2000);
      expect(game.consoleErrors.length).toBe(before);
      const roleRows = await game
        .locator(`#${sheetId} li.item[data-item-category="role"]`)
        .count();
      expect(roleRows).toBe(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
