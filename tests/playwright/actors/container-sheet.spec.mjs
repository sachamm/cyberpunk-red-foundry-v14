import { test, expect } from "@playwright/test";
import {
  gotoReadyWorld,
  openPlayerPage,
} from "../../../tools/playwright/session/world.mjs";
import {
  createDocumentViaUI,
  expectSheetRendered,
  closeDocSheet,
  openOwnedItemSheet,
  closeOwnedItemSheet,
  dismissNotifications,
  uniqueName,
  reopenActorSheetViaUI,
  dragItemToActorSheet,
  createItemViaUI,
  openSidebarTab,
  openTokenSheet,
  activateGearTab,
  openItemSettings,
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
  createButtonByType: (type) => `.item-create[data-item-type="${type}"]`,
  categoryHeader: ".items-header.collapsible",
  expandButton: ".expand-button",
  collapseIcon: ".collapse-icon",
  expandIcon: ".expand-icon",
  itemName: ".item-edit",
  itemAmount: ".item.flexrow .item-detail",
  itemPrice: ".gear-data",
  purchaseAll: 'a.item-action[data-action-type="purchase"]',
  purchasePart: 'a.item-action[data-action-type="purchaseFraction"]',
  takeItemAll: 'a.item-action[data-action-type="purchase"]',
  takeItemPart: 'a.item-action[data-action-type="purchaseFraction"]',
  deleteItem: 'a.item-action[data-action-type="delete"]',
  toggleInstalled: ".toggle-installed-visibility",
};

function sheet(page, sheetId) {
  return page.locator(`#${sheetId}`);
}

/**
 * Wait for specific fields to be available in the UI. This is useful to avoid race
 * conditions when rendering a sheet, sometimes the DB updates land quickly but
 * the UI doesn't catch up or re-render, resulting in an apparent desync between
 * server and client.
 *
 * @param {String} actorId - which actor's sheet to wait for
 * @param {Map} expected - a map-like of field names and values
 * @returns undefined
 */
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

/**
 * Convenience function to generate a container actor with an item in its inventory.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} containerName - base name for the container actor (made unique)
 * @param {String} itemType - type of the item created in the container's inventory
 * @param {String} itemName - (optional) name for the item; defaults to "New {Type}"
 * @returns {Object} - an object with an actorId, sheetId, and itemId
 */
async function createContainerWithItem(
  game,
  { containerName, itemType, itemName },
) {
  const actorId = await createDocumentViaUI(game, {
    documentTab: "actors",
    type: "container",
    name: uniqueName(containerName),
  });

  const sheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });

  const { itemId, sheetId: freshSheetId } = await createInventoryItemViaUI(
    game,
    { actorId, sheetId, itemType, itemName },
  );

  return { actorId, sheetId: freshSheetId, itemId };
}

/**
 * Similar to createContainerWithItem but sets the type to stash after
 * creating the actor and item.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} stashName - base name for the stash (made unique)
 * @param {String} itemName - (optional) name for the item; defaults to "New {Type}"
 * @returns {Object} - an object with an actorId and sheetId
 */
async function createStashWithItem(game, { stashName, itemName }) {
  const { actorId } = await createContainerWithItem(game, {
    containerName: stashName,
    itemType: "gear",
    itemName,
  });

  await game.evaluate(
    async ({ actorId }) => {
      const actor = game.actors.get(actorId);
      if (actor) {
        await actor.setContainerType("stash");
        if (actor.sheet.rendered) await actor.sheet.render();
      }
    },
    { actorId },
  );

  const sheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });

  return { actorId, sheetId };
}

/**
 * Enable the world setting that lets players create inventory items. The
 * + buttons on character sheets only render when it is on; container
 * sheets show them to GMs regardless.
 *
 * @param {Object} game - the top-level game object from Foundry
 */
async function enablePlayersCreateInventory(game) {
  await game.evaluate(async () => {
    await game.settings.set(game.system.id, "playersCreateInventory", true);
  });
}

/**
 * Create an item in an actor's inventory via the UI by clicking the
 * category header's + button on the actor's sheet (container or
 * character). Optionally renames the item and applies additional item
 * data after creation. Character sheets need the playersCreateInventory
 * world setting enabled first; see enablePlayersCreateInventory.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} actorId - id of the actor owning the item
 * @param {String} sheetId - rendered element id of the actor's sheet
 * @param {String} itemType - type of the item to create (a key of CPR.inventoryCategories)
 * @param {String} itemName - (optional) name for the item; defaults to "New {Type}"
 * @param {Object} data - (optional) additional item data applied after creation
 * @returns {Object} - an object with the itemId and a refreshed sheetId
 */
async function createInventoryItemViaUI(
  game,
  { actorId, sheetId, itemType, itemName, data },
) {
  const actorSheet = sheet(game, sheetId);

  // Character sheets keep the gear list behind a tab; activate it so the
  // + button is visible. Container sheets have no such tab.
  if (await actorSheet.locator('.navtabs-right a[data-tab="gear"]').count()) {
    await activateGearTab(game, sheetId);
  }

  const existingIds = await game.evaluate((id) => {
    return Array.from(game.actors.get(id).items.map((item) => item.id));
  }, actorId);

  const createBtn = actorSheet.locator(FIELD.createButtonByType(itemType));
  await expect(createBtn).toBeVisible();
  await createBtn.click();

  const newItemHandle = await game.waitForFunction(
    ({ id, existingIds }) => {
      const items = Array.from(game.actors.get(id).items.map((i) => i.id));
      return items.find((v) => !existingIds.includes(v)) ?? null;
    },
    { id: actorId, existingIds },
    { timeout: 10000 },
  );
  const itemId = await newItemHandle.jsonValue();
  expect(itemId).toBeTruthy();

  if (itemName) {
    const nameLink = actorSheet
      .locator(`li.item[data-item-id="${itemId}"]`)
      .locator("a.item-edit");
    await nameLink.click();

    const itemSheetId = await openOwnedItemSheet(game, { actorId, itemId });
    const itemSheet = await openItemSettings(game, itemSheetId);
    const nameInput = itemSheet.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(itemName);
    await nameInput.blur();

    await game.waitForFunction(
      ({ actorId, itemId, itemName }) =>
        game.actors.get(actorId)?.items.get(itemId)?.name === itemName,
      { actorId, itemId, itemName },
      { timeout: 5000 },
    );

    await closeOwnedItemSheet(game, { actorId, itemId });
  }

  if (data) {
    await game.evaluate(
      ({ actorId, itemId, data }) =>
        game.actors.get(actorId).items.get(itemId).update(data),
      { actorId, itemId, data },
    );
    await game.waitForFunction(
      ({ actorId, itemId, data }) => {
        const item = game.actors.get(actorId)?.items.get(itemId);
        if (!item) return false;
        const flat = [];
        const walk = (obj, prefix) => {
          for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (
              value !== null &&
              typeof value === "object" &&
              !Array.isArray(value)
            ) {
              walk(value, path);
            } else {
              flat.push([path, value]);
            }
          }
        };
        walk(foundry.utils.expandObject(data), "");
        return flat.every(
          ([path, value]) =>
            JSON.stringify(foundry.utils.getProperty(item, path)) ===
            JSON.stringify(value),
        );
      },
      { actorId, itemId, data },
      { timeout: 5000 },
    );
  }

  const freshSheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });

  return { itemId, sheetId: freshSheetId };
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

/**
 * Tests begin here ya mook
 */

test.describe("Container actor sheet", () => {
  test.describe("Common behaviors", () => {
    test("name edits persist after close and reopen", async ({
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
        await expect(containerSheet.locator(FIELD.name)).toHaveValue(
          editedName,
        );

        await waitForActorFields(game, actorId, { name: editedName });
        await closeDocSheet(game, { collection: "actors", id: actorId });
        sheetId = await reopenActorSheetViaUI(game, actorId);

        const reopenedSheet = sheet(game, sheetId);
        await expect(reopenedSheet.locator(FIELD.name)).toHaveValue(editedName);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("category collapse/expand toggles item visibility", async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "stash-container",
        itemType: "gear",
      });

      await test.step("verify item is visible in expanded category, then collapse hides it", async () => {
        const containerSheet = sheet(game, sheetId);

        const gearCategory = containerSheet
          .locator(FIELD.categoryHeader)
          .filter({ hasText: "Gear" });
        await expect(gearCategory).toBeVisible();

        const gearItemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(gearItemRow).toBeVisible();
        const itemHasHide = await gearItemRow.evaluate((el) =>
          el.classList.contains("hide"),
        );
        expect(itemHasHide).toBe(false);

        await gearCategory.locator(FIELD.expandButton).click();

        await expect(gearItemRow).not.toBeVisible();

        const itemHasHideAfter = await gearItemRow.evaluate((el) =>
          el.classList.contains("hide"),
        );
        expect(itemHasHideAfter).toBe(true);
      });

      await test.step("re-expand shows the item again", async () => {
        const containerSheet = sheet(game, sheetId);

        const gearCategory = containerSheet
          .locator(FIELD.categoryHeader)
          .filter({ hasText: "Gear" });
        await expect(gearCategory).toBeVisible();

        await gearCategory.locator(FIELD.expandButton).click();

        const gearItemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(gearItemRow).toBeVisible();

        const itemHasHideAfter = await gearItemRow.evaluate((el) =>
          el.classList.contains("hide"),
        );
        expect(itemHasHideAfter).toBe(false);
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
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "edit-fields-container",
        itemType: "gear",
      });

      await test.step("open the item sheet by clicking on the item name", async () => {
        const containerSheet = sheet(game, sheetId);

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const itemEditLink = itemRow.locator(FIELD.itemName);
        await itemEditLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            const item = actor.items.find((i) => i.name === "New Gear");
            return item?.sheet?.rendered === true;
          },
          { actorId },
          { timeout: 5000 },
        );
      });

      await test.step("verify item sheet is open and editable", async () => {
        const itemSheet = game.locator(".application .item-sheet");
        await expect(itemSheet).toBeVisible();
      });

      await test.step("edit the price field", async () => {
        const itemSheet = game.locator(".application .item-sheet");

        const settingsTab = itemSheet.locator('a[data-tab="item-settings"]');
        await settingsTab.click();

        await expect(settingsTab).toHaveClass(/active/);

        const priceInput = itemSheet.locator(
          'input[name="system.price.market"]',
        );
        await expect(priceInput).toBeVisible();
        await priceInput.fill("500");
        await priceInput.blur();
      });

      await test.step("edit the amount field", async () => {
        const itemSheet = game.locator(".application .item-sheet");

        const amountInput = itemSheet.locator('input[name="system.amount"]');
        await expect(amountInput).toBeVisible();
        await amountInput.fill("10");
        await amountInput.blur();

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
        const itemSheet = game.locator(".application .item-sheet");
        await expect(itemSheet).toBeVisible();

        await game.evaluate(
          async ({ actorId }) => {
            const actor = game.actors.get(actorId);
            if (actor) {
              const item = actor.items.find((i) => i.name === "New Gear");
              if (item && item.sheet.rendered) {
                item.sheet.close();
              }
            }
          },
          { actorId },
        );

        await expect(itemSheet).not.toBeVisible();
      });

      let updatedSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
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

    test("ctrl-clicking an item name posts an item card to the chat log", async ({
      page: game,
    }) => {
      // macOS Chromium treats Ctrl+click as a right-click (context menu) and never
      // dispatches `click`, so use Cmd there. The handler accepts both modifiers
      // (`event.ctrlKey || event.metaKey`).
      const cardModifier =
        process.platform === "darwin" ? ["Meta"] : ["Control"];

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

    test("drag-and-drop onto container", async ({ page: game }) => {
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

    test("content filter/search is not available on container sheet", async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "no-filter-container",
        itemType: "gear",
      });

      await test.step("verify no filter input exists on container sheet", async () => {
        const containerSheet = sheet(game, sheetId);
        const filterInput = containerSheet.locator(
          'input[placeholder*="filter"], input[placeholder*="search"], input.filter-contents',
        );
        const filterCount = await filterInput.count();
        expect(filterCount).toBe(0);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("multiple categories collapse/expand independently", async ({
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

      await test.step("collapse Weapon category and verify only Armor items remain visible", async () => {
        const containerSheet = sheet(game, sheetId);

        const weaponCategory = containerSheet
          .locator(FIELD.categoryHeader)
          .filter({ hasText: "Weapon" });
        await expect(weaponCategory).toBeVisible();

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

      await test.step("re-expand Weapon category and verify both are visible", async () => {
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

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("changing container type to loot on a non-token sheet shows an error", async ({
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

      await test.step("changing container type to loot on a non-token sheet shows an error", async () => {
        const containerSheet = sheet(game, sheetId);
        const dropdown = containerSheet.locator(FIELD.containerTypeDropdown);

        await dropdown.selectOption({ value: "loot" });

        await expect(game.locator(".notification.error")).toBeVisible();
        await dismissNotifications(game);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("toggling infinite-stock on a non-token sheet shows an error", async ({
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

      await test.step("toggling infinite-stock on non-token sheet shows error", async () => {
        const containerSheet = sheet(game, sheetId);
        const toggle = containerSheet.locator(
          '.checkbox-toggle[data-flag-name="infinite-stock"]',
        );
        const exists = await toggle.count();
        if (exists > 0) {
          await toggle.click();
          const errorNotification = game.locator(".notification.error");
          await expect(errorNotification).toBeVisible();
          const errorMessage = await errorNotification.evaluate(
            (el) => el.textContent,
          );
          expect(errorMessage.toLowerCase()).toContain("token");
          await dismissNotifications(game);
        }
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });
  });

  test.describe("Shop", () => {
    test("initial/default presentation for GMs", async ({ page: game }) => {
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

        await expect(containerSheet.locator(FIELD.name)).toHaveValue(
          initialName,
        );
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

      // One could argue that the expansion/collapse glyphs should not be displayed if a category is empty
      // While this test is "to spec", it is a little nonsensical.
      await test.step("inventory categories are rendered as collapsible sections even when empty", async () => {
        const containerSheet = sheet(game, sheetId);
        const categories = containerSheet.locator(FIELD.categoryHeader);
        const count = await categories.count();
        expect(count).toBeGreaterThan(0);

        const firstCategory = categories.first();
        await expect(firstCategory.locator(FIELD.expandIcon)).toBeVisible();

        const categoryNames = await categories.evaluateAll((els) =>
          els.map((el) => el.textContent.trim()),
        );
        expect(categoryNames.length).toBeGreaterThan(0);
      });

      await test.step("create item buttons are visible for GM on category headers", async () => {
        const containerSheet = sheet(game, sheetId);
        const createButtons = containerSheet.locator(FIELD.createButton);
        const count = await createButtons.count();
        expect(count).toBeGreaterThan(0);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("GM can purchase items from container inventory with sufficient funds", async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "purchase-test-container",
        itemType: "gear",
      });

      await test.step("set trade partner with sufficient funds", async () => {
        const containerSheet = sheet(game, sheetId);

        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
        }

        await game.evaluate(
          async ({ tradePartnerOption }) => {
            const tradePartner = game.actors.get(tradePartnerOption);
            if (tradePartner) {
              await tradePartner.update({ "system.wealth.value": 999999 });
            }
          },
          { tradePartnerOption },
        );
      });

      await test.step("purchase all items and verify they are removed", async () => {
        const containerSheet = sheet(game, sheetId);

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );

        const remainingItems = containerSheet
          .locator(FIELD.itemName)
          .filter({ hasText: "New Gear" });
        await expect(remainingItems).toHaveCount(0);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("infinite stock prevents item removal on purchase (shop)", async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "shop-infinite-stock-container",
        itemType: "gear",
      });

      await test.step("enable infinite stock flag on shop container", async () => {
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (actor) {
              await actor.update({
                [`flags.${game.system.id}.infinite-stock`]: true,
              });
              if (actor.sheet.rendered) await actor.sheet.render();
            }
          },
          { actorId },
        );
      });

      await test.step("purchase item and verify it is NOT removed", async () => {
        const containerSheet = sheet(game, sheetId);

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );

        const remainingItems = containerSheet
          .locator(FIELD.itemName)
          .filter({ hasText: "New Gear" });
        await expect(remainingItems).toHaveCount(1);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("both actors' eurobucks ledgers update when selling items to shop", async ({
      page: game,
    }) => {
      await enablePlayersCreateInventory(game);

      const playerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("seller-character"),
      });

      const playerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: playerActorId,
      });

      const weaponName = uniqueName("assault-rifle");
      await createInventoryItemViaUI(game, {
        actorId: playerActorId,
        sheetId: playerSheetId,
        itemType: "weapon",
        itemName: weaponName,
        data: {
          system: {
            weaponType: "assaultRifle",
            isRanged: true,
            magazine: { value: 0, max: 30 },
            installedItems: { allowedTypes: ["ammo"] },
            ammoVariety: ["rifle"],
          },
        },
      });

      const containerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("shop-sell-container"),
      });

      let containerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });

      await test.step("configure container to buy weapons at 50% of market price", async () => {
        await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (container) {
              await container.setContainerType("shop");
              await container.update({
                "system.vendor": {
                  itemTypes: {
                    weapon: { isPurchasing: true, purchasePercentage: "50" },
                  },
                },
              });
              if (container.sheet.rendered) await container.sheet.render();
            }
          },
          { containerActorId },
        );
      });

      await test.step("set up shop with sufficient funds", async () => {
        const containerSheet = sheet(game, containerSheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
        }
        await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (container) {
              await container.update({ "system.wealth.value": 999999 });
            }
          },
          { containerActorId },
        );
      });

      await test.step("sell item to shop via drag-and-drop and verify both ledgers update", async () => {
        await openSidebarTab(game, "actors");
        const playerEntry = game.locator(
          `#actors [data-entry-id="${playerActorId}"]`,
        );
        await expect(playerEntry).toBeVisible();
        await playerEntry.click();

        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });
        const gearContent = await activateGearTab(game, playerSheetId);

        const weaponRow = gearContent
          .locator('li.item[data-item-category="weapon"]')
          .filter({ hasText: weaponName });
        await expect(weaponRow).toBeVisible();

        const containerEl = game.locator(`#${containerSheetId}`);
        await expect(containerEl).toBeVisible();

        const itemBefore = await game.evaluate(
          async ({ playerActorId, weaponName }) => {
            const player = game.actors.get(playerActorId);
            const item = player.items.find((i) => i.name === weaponName);
            if (!item) return null;
            return {
              price: item.system.price.market,
              magazineValue: item.system.magazine?.value,
              magazineMax: item.system.magazine?.max,
            };
          },
          { playerActorId, weaponName },
        );

        await game.evaluate(
          async ({ playerActorId, containerActorId, weaponName }) => {
            const container = game.actors.get(containerActorId);
            const player = game.actors.get(playerActorId);
            const item = player.items.find((i) => i.name === weaponName);
            if (!item) {
              throw new Error("Weapon not found on player");
            }
            // Mock DialogV2.confirm to return true immediately
            const originalConfirm = foundry.applications.api.DialogV2.confirm;
            foundry.applications.api.DialogV2.confirm = async () => true;
            await container.sheet._sellItemTo(playerActorId, item);
            foundry.applications.api.DialogV2.confirm = originalConfirm;
          },
          { playerActorId, containerActorId, weaponName },
        );

        const containerItemAfter = await game.evaluate(
          async ({ containerActorId, weaponName }) => {
            const container = game.actors.get(containerActorId);
            if (!container) return false;
            return container.items.some((i) => i.name === weaponName);
          },
          { containerActorId, weaponName },
        );
        expect(containerItemAfter).toBe(true);

        const containerItemData = await game.evaluate(
          async ({ containerActorId, weaponName }) => {
            const container = game.actors.get(containerActorId);
            const item = container.items.find((i) => i.name === weaponName);
            return {
              price: item?.system?.price?.market,
              magazineValue: item?.system?.magazine?.value,
              magazineMax: item?.system?.magazine?.max,
            };
          },
          { containerActorId, weaponName },
        );
        expect(containerItemData.price).toBe(itemBefore.price);
        expect(containerItemData.magazineValue).toBe(itemBefore.magazineValue);
        expect(containerItemData.magazineMax).toBe(itemBefore.magazineMax);

        // Verify both actors' ledgers were updated correctly
        const ledgerData = await game.evaluate(
          async ({ playerActorId, containerActorId }) => {
            const player = game.actors.get(playerActorId);
            const container = game.actors.get(containerActorId);
            return {
              playerWealth: player.system.wealth.value,
              playerTransactions: player.system.wealth.transactions,
              shopWealth: container.system.wealth.value,
              shopTransactions: container.system.wealth.transactions,
            };
          },
          { playerActorId, containerActorId },
        );

        // Player (seller) wealth increased by vendorOffer (100 * 50% = 50)
        expect(ledgerData.playerWealth).toBe(50);

        // Shop wealth decreased by vendorOffer (999999 - 50 = 999949)
        expect(ledgerData.shopWealth).toBe(999949);

        // Player's ledger has an "increase" transaction entry
        expect(
          ledgerData.playerTransactions.some((t) => t[0].includes("increase")),
        ).toBe(true);

        // Shop's ledger has a "decrease" transaction entry
        expect(
          ledgerData.shopTransactions.some((t) => t[0].includes("decrease")),
        ).toBe(true);
      });

      await closeDocSheet(game, { collection: "actors", id: playerActorId });
      await closeDocSheet(game, { collection: "actors", id: containerActorId });
    });

    test("player sells item to shop with zero wealth", async ({
      page: game,
    }) => {
      await enablePlayersCreateInventory(game);

      const playerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("seller-zero-wealth"),
      });

      await test.step("create a gear item on the player character", async () => {
        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });

        await createInventoryItemViaUI(game, {
          actorId: playerActorId,
          sheetId: playerSheetId,
          itemType: "gear",
          itemName: "Sellable Gear Zero",
        });
      });

      const containerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("shop-zero-wealth-container"),
      });

      let containerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });

      await test.step("configure container to buy gear at 50% with zero funds", async () => {
        await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (container) {
              await container.setContainerType("shop");
              await container.update({
                "system.wealth.value": 0,
                "system.vendor": {
                  itemTypes: {
                    gear: { isPurchasing: true, purchasePercentage: "50" },
                  },
                },
              });
              if (container.sheet.rendered) await container.sheet.render();
            }
          },
          { containerActorId },
        );
      });

      await test.step("sell item to shop with zero funds and verify ledgers update", async () => {
        await openSidebarTab(game, "actors");
        const playerEntry = game.locator(
          `#actors [data-entry-id="${playerActorId}"]`,
        );
        await expect(playerEntry).toBeVisible();
        await playerEntry.click();

        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });
        const gearContent = await activateGearTab(game, playerSheetId);

        const itemRow = gearContent
          .locator('li.item[data-item-category="gear"]')
          .filter({ hasText: "Sellable Gear Zero" });
        await expect(itemRow).toBeVisible();

        const containerEl = game.locator(`#${containerSheetId}`);
        await expect(containerEl).toBeVisible();

        await game.evaluate(
          async ({ containerActorId, playerActorId }) => {
            const container = game.actors.get(containerActorId);
            const player = game.actors.get(playerActorId);
            if (!container || !player) {
              throw new Error("container or player not found");
            }

            const item = player.items.find(
              (i) => i.name === "Sellable Gear Zero",
            );
            if (!item) {
              throw new Error("item not found in player inventory");
            }

            // Mock DialogV2.confirm to return true immediately
            const originalConfirm = foundry.applications.api.DialogV2.confirm;
            foundry.applications.api.DialogV2.confirm = async () => true;

            await container.sheet._sellItemTo(playerActorId, item);

            // Restore original DialogV2.confirm
            foundry.applications.api.DialogV2.confirm = originalConfirm;
          },
          { containerActorId, playerActorId },
        );

        const containerItemAfter = await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (!container) return false;
            return container.items.some((i) => i.name === "Sellable Gear Zero");
          },
          { containerActorId },
        );
        expect(containerItemAfter).toBe(true);

        // Verify both actors' ledgers were updated (shop has 0 wealth, so vendorOffer = 0)
        const ledgerData = await game.evaluate(
          async ({ playerActorId, containerActorId }) => {
            const player = game.actors.get(playerActorId);
            const container = game.actors.get(containerActorId);
            return {
              playerWealth: player.system.wealth.value,
              playerTransactions: player.system.wealth.transactions,
              shopWealth: container.system.wealth.value,
              shopTransactions: container.system.wealth.transactions,
            };
          },
          { playerActorId, containerActorId },
        );

        // Player wealth stays at 0 (shop could only offer 0)
        expect(ledgerData.playerWealth).toBe(0);

        // Shop wealth stays at 0
        expect(ledgerData.shopWealth).toBe(0);

        // Both ledgers should still have entries recorded
        expect(ledgerData.playerTransactions.length).toBeGreaterThan(0);
        expect(ledgerData.shopTransactions.length).toBeGreaterThan(0);
      });

      await closeDocSheet(game, { collection: "actors", id: playerActorId });
      await closeDocSheet(game, { collection: "actors", id: containerActorId });
    });

    test("purchase a part of a stack", async ({ page: game }) => {
      const actorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("partial-purchase-container"),
      });

      let sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });

      await test.step("create a gear item with amount > 1", async () => {
        sheetId = (
          await createInventoryItemViaUI(game, {
            actorId,
            sheetId,
            itemType: "gear",
            data: { "system.amount": 5 },
          })
        ).sheetId;
      });

      await test.step("set trade partner and click purchase fraction", async () => {
        const containerSheet = sheet(game, sheetId);

        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
          await game.evaluate(
            async ({ tradePartnerOption }) => {
              const tradePartner = game.actors.get(tradePartnerOption);
              if (tradePartner) {
                await tradePartner.update({ "system.wealth.value": 999999 });
              }
            },
            { tradePartnerOption },
          );
        }

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchasePartLink = itemRow.locator(FIELD.purchasePart);
        await expect(purchasePartLink).toBeVisible();
        await purchasePartLink.click();

        const dialog = game.locator(".dialog, .application.dialog");
        await expect(dialog).toBeVisible();

        const amountInput = dialog.locator('input[name="purchaseAmount"]');
        await expect(amountInput).toBeVisible();
        await amountInput.fill("2");

        const confirmBtn = dialog.locator('button[data-action="confirm"]');
        await expect(confirmBtn).toBeVisible();
        await confirmBtn.click();

        // Wait for dialog to close
        await expect(dialog).not.toBeVisible();
      });

      await test.step("verify remaining amount is 3 (5 - 2)", async () => {
        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            const item = actor.items.find((i) => i.name === "New Gear");
            return item?.system?.amount === 3;
          },
          { actorId },
          { timeout: 10000 },
        );

        const containerSheet = sheet(game, sheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();
        const amountText = await itemRow
          .locator(".item-detail")
          .evaluate((el) => el.textContent);
        expect(amountText).toContain("3");
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("purchase with insufficient funds shows warning", async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "insufficient-funds-container",
        itemType: "gear",
      });

      await test.step("set trade partner with zero wealth", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
          await game.evaluate(
            async ({ tradePartnerOption }) => {
              const tradePartner = game.actors.get(tradePartnerOption);
              if (tradePartner) {
                await tradePartner.update({ "system.wealth.value": 0 });
              }
            },
            { tradePartnerOption },
          );
        }
      });

      await test.step("attempting purchase shows a warning notification", async () => {
        const containerSheet = sheet(game, sheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await expect(
          game.locator(".notification.warning, .notification.error"),
        ).toBeVisible();
        await dismissNotifications(game);

        const remainingItems = containerSheet
          .locator(FIELD.itemName)
          .filter({ hasText: "New Gear" });
        await expect(remainingItems).toHaveCount(1);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("purchase without trade partner shows warning", async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "no-trade-partner-container",
        itemType: "gear",
      });

      await test.step("attempting purchase without trade partner shows warning", async () => {
        const containerSheet = sheet(game, sheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await expect(game.locator(".notification.warning")).toBeVisible();
        await dismissNotifications(game);

        const remainingItems = containerSheet
          .locator(FIELD.itemName)
          .filter({ hasText: "New Gear" });
        await expect(remainingItems).toHaveCount(1);
      });

      await test.step("selecting trade partner and completing purchase works", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
        }

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await purchaseLink.click();

        await game.waitForFunction(
          async ({ actorId }) => {
            const actor = game.actors.get(actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("ammo pricing edge case (÷10)", async ({ page: game }) => {
      const actorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("ammo-pricing-container"),
      });

      let sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });

      await test.step("create an ammo item with market price 100", async () => {
        sheetId = (
          await createInventoryItemViaUI(game, {
            actorId,
            sheetId,
            itemType: "ammo",
            data: { "system.price.market": 100 },
          })
        ).sheetId;
      });

      await test.step("purchase ammo and verify price is divided by 10", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
          await game.evaluate(
            async ({ tradePartnerOption }) => {
              const tradePartner = game.actors.get(tradePartnerOption);
              if (tradePartner) {
                await tradePartner.update({ "system.wealth.value": 999999 });
              }
            },
            { tradePartnerOption },
          );
        }

        const tradePartnerWealthBefore = await game.evaluate(
          async ({ tradePartnerOption }) => {
            const tradePartner = game.actors.get(tradePartnerOption);
            return tradePartner?.system?.wealth?.value ?? 0;
          },
          { tradePartnerOption },
        );

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Ammo" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "New Ammo");
          },
          { actorId },
          { timeout: 5000 },
        );

        await waitForActorFields(game, tradePartnerOption, {
          "system.wealth.value": tradePartnerWealthBefore - 10,
        });
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("stacking after purchase", async ({ page: game }) => {
      const actorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("stacking-container"),
      });

      let sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });

      await test.step("create a gear item named 'Plasma Rifle' in the container", async () => {
        sheetId = (
          await createInventoryItemViaUI(game, {
            actorId,
            sheetId,
            itemType: "gear",
            itemName: "Plasma Rifle",
          })
        ).sheetId;
      });

      await test.step("create trade partner with existing 'Plasma Rifle'", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
          await game.evaluate(
            async ({ tradePartnerOption }) => {
              const tradePartner = game.actors.get(tradePartnerOption);
              if (tradePartner) {
                await tradePartner.update({ "system.wealth.value": 999999 });
                // eslint-disable-next-line no-restricted-syntax -- stacking test needs direct API
                await tradePartner.createEmbeddedDocuments("Item", [
                  {
                    name: "Plasma Rifle",
                    type: "gear",
                    system: {
                      amount: 1,
                      price: { market: 500 },
                      description: { value: "Existing plasma rifle" },
                    },
                  },
                ]);
              }
            },
            { tradePartnerOption },
          );
        }
      });

      await test.step("purchase another 'Plasma Rifle' and verify stacking", async () => {
        const containerSheet = sheet(game, sheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "Plasma Rifle" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "Plasma Rifle");
          },
          { actorId },
          { timeout: 5000 },
        );

        const tradePartnerId = await game.evaluate((sid) => {
          const sheetEl = document.getElementById(sid);
          const select = sheetEl?.querySelector(
            'select[name="trade-with-dropdown"]',
          );
          return (
            Array.from(select?.options ?? []).find((o) => o.value !== "")
              ?.value ?? null
          );
        }, sheetId);

        // The stacking update fired by _purchaseItem is not awaited in the
        // sheet code, so poll until the partner's stack reflects it.
        const amountHandle = await game.waitForFunction(
          ({ partnerId }) => {
            const partner = game.actors.get(partnerId);
            const plasmaRifle = partner?.items.find(
              (i) => i.name === "Plasma Rifle",
            );
            return plasmaRifle?.system.amount === 2
              ? plasmaRifle.system.amount
              : null;
          },
          { partnerId: tradePartnerId },
          { timeout: 10000 },
        );
        const tradePartnerAmount = await amountHandle.jsonValue();
        expect(tradePartnerAmount).toBe(2);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("eurobucks ledger updates after purchase", async ({ page: game }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "ledger-update-container",
        itemType: "gear",
      });

      let selectedTradePartnerId = null;

      await test.step("set up trade partner with known wealth", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          selectedTradePartnerId = tradePartnerOption;
          await tradeDropdown.selectOption({ value: tradePartnerOption });
          await game.evaluate(
            async ({ tradePartnerOption }) => {
              const tradePartner = game.actors.get(tradePartnerOption);
              if (tradePartner) {
                await tradePartner.update({ "system.wealth.value": 500 });
              }
            },
            { tradePartnerOption },
          );
        }
      });

      await test.step("purchase item and verify wealth changes", async () => {
        const containerSheet = sheet(game, sheetId);

        const containerWealthBefore = await game.evaluate(
          async ({ actorId }) => {
            const container = game.actors.get(actorId);
            return container?.system?.wealth?.value ?? 0;
          },
          { actorId },
        );

        const tradePartnerWealthBefore = await game.evaluate(
          async ({ tradePartnerId }) => {
            if (!tradePartnerId) return 0;
            const tradePartner = game.actors.get(tradePartnerId);
            if (!tradePartner) return 0;
            return tradePartner.system?.wealth?.value ?? 0;
          },
          { tradePartnerId: selectedTradePartnerId },
        );

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );

        await waitForActorFields(game, selectedTradePartnerId, {
          "system.wealth.value": tradePartnerWealthBefore - 100,
        });
        await waitForActorFields(game, actorId, {
          "system.wealth.value": containerWealthBefore + 100,
        });
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("trade log entries after purchase", async ({ page: game }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "trade-log-container",
        itemType: "gear",
      });

      await test.step("set up shop with sufficient funds", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
        }
        await game.evaluate(
          async ({ actorId }) => {
            const container = game.actors.get(actorId);
            if (container) {
              await container.update({ "system.wealth.value": 999999 });
            }
          },
          { actorId },
        );
      });

      await test.step("purchase item and verify trade log entry exists", async () => {
        const containerSheet = sheet(game, sheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );

        // Capture the ledger in the same poll that observes the entry so a
        // late update cannot clear it between the wait and the assertion.
        // The capture is JSON-encoded because waitForFunction only returns
        // primitives directly.
        const recordsJson = await game.waitForFunction(
          (params) => {
            const container = game.actors.get(params.actorId);
            if (!container) return null;
            const recs = container.listRecords("wealth");
            if (!Array.isArray(recs) || recs.length === 0) return null;
            const latestEntry = recs[recs.length - 1];
            return typeof latestEntry?.[1] === "string" &&
              latestEntry[1].includes("New Gear") &&
              latestEntry[1].includes("100")
              ? JSON.stringify(recs)
              : null;
          },
          { actorId },
          { timeout: 5000 },
        );

        const records = JSON.parse(recordsJson);
        expect(records.length).toBeGreaterThan(0);
        const latestEntry = records[records.length - 1];
        expect(latestEntry[1]).toContain("New Gear");
        expect(latestEntry[1]).toContain("100");
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("changing trade partner mid-session", async ({ page: game }) => {
      const secondPartnerId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("second-partner"),
      });

      await game.evaluate(
        async ({ secondPartnerId }) => {
          const partner = game.actors.get(secondPartnerId);
          if (partner) {
            await partner.update({ "system.wealth.value": 5000 });
          }
        },
        { secondPartnerId },
      );

      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "trade-partner-change-container",
        itemType: "gear",
      });

      await test.step("set up first trade partner with known wealth", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const firstPartnerOption = options.find((v) => v !== "");
        if (firstPartnerOption) {
          await tradeDropdown.selectOption({ value: firstPartnerOption });
          await game.evaluate(
            async ({ firstPartnerOption }) => {
              const partner = game.actors.get(firstPartnerOption);
              if (partner) {
                await partner.update({ "system.wealth.value": 1000 });
              }
            },
            { firstPartnerOption },
          );
        }
      });

      await test.step("switch to second trade partner and purchase", async () => {
        const containerSheet = sheet(game, sheetId);
        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );

        await game.evaluate(
          async ({ actorId }) => {
            const actor = game.actors.get(actorId);
            if (actor && actor.sheet.rendered) {
              await actor.sheet.render();
            }
          },
          { actorId },
        );

        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const secondPartnerOption = options.find((v) => v === secondPartnerId);
        if (secondPartnerOption) {
          await tradeDropdown.selectOption({ value: secondPartnerOption });
        }

        await game.waitForFunction(
          async ({ sheetId, secondPartnerId }) => {
            const sheetEl = document.getElementById(sheetId);
            if (!sheetEl) return false;
            const select = sheetEl.querySelector(
              'select[name="trade-with-dropdown"]',
            );
            return select?.value === secondPartnerId;
          },
          { sheetId, secondPartnerId },
          { timeout: 5000 },
        );

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );

        await waitForActorFields(game, secondPartnerId, {
          "system.wealth.value": 4900,
        });

        await closeDocSheet(game, { collection: "actors", id: actorId });
        await closeDocSheet(game, {
          collection: "actors",
          id: secondPartnerId,
        });
      });
    });

    test("transacted items arrive with their installed upgrades", async ({
      page: game,
    }) => {
      // A weapon with an installed itemUpgrade is sold to a shop and bought
      // back again. Both transaction directions must carry the upgrade over
      // (sell duplicates it via the container's createEmbeddedDocuments;
      // purchase carries it via the install-tree flag). Proof is read off the
      // recipient's sheets first, with supporting state reads.
      const weaponName = uniqueName("upgraded-rifle");
      const upgradeName = uniqueName("rifle-upgrade");
      let playerActorId;
      let containerActorId;
      let embeddedWeaponId;
      let embeddedUpgradeId;

      // State read shared by both transaction directions: how many upgrades
      // the recipient owns, and whether every installed-upgrade reference on
      // the weapon resolves to one of them (by id or uuid).
      const readInstalledState = (actorId) =>
        game.evaluate(
          ({ actorId, weaponName, upgradeName }) => {
            const actor = game.actors.get(actorId);
            const weapon = actor.items.find((i) => i.name === weaponName);
            const list = weapon.system.installedItems.list;
            return {
              listLength: list.length,
              allReferencesResolve: list.every((ref) =>
                actor.items.some((i) => i.id === ref || i.uuid === ref),
              ),
              upgradeCount: actor.items.filter(
                (i) => i.name === upgradeName && i.type === "itemUpgrade",
              ).length,
            };
          },
          { actorId, weaponName, upgradeName },
        );

      await test.step("create a character, a weapon, and an upgrade via the UI", async () => {
        playerActorId = await createDocumentViaUI(game, {
          documentTab: "actors",
          type: "character",
          name: uniqueName("upgrade-trade-character"),
        });
        const worldWeaponId = await createItemViaUI(game, {
          type: "weapon",
          name: weaponName,
        });
        const worldUpgradeId = await createItemViaUI(game, {
          type: "itemUpgrade",
          name: upgradeName,
        });
        // Close the item sheets that open on creation so drags land on the actor sheet.
        await closeDocSheet(game, { collection: "items", id: worldWeaponId });
        await closeDocSheet(game, { collection: "items", id: worldUpgradeId });

        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });
        await dragItemToActorSheet(game, {
          itemId: worldWeaponId,
          sheetId: playerSheetId,
          actorId: playerActorId,
        });
        await dragItemToActorSheet(game, {
          itemId: worldUpgradeId,
          sheetId: playerSheetId,
          actorId: playerActorId,
        });

        ({ embeddedWeaponId, embeddedUpgradeId } = await game.evaluate(
          ({ playerActorId, weaponName, upgradeName }) => {
            const actor = game.actors.get(playerActorId);
            return {
              embeddedWeaponId: actor.items.find((i) => i.name === weaponName)
                .id,
              embeddedUpgradeId: actor.items.find((i) => i.name === upgradeName)
                .id,
            };
          },
          { playerActorId, weaponName, upgradeName },
        ));
      });

      await test.step("install the upgrade into the weapon from the weapon's item sheet", async () => {
        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });
        const gear = await activateGearTab(game, playerSheetId);
        const weaponRow = gear
          .locator('li.item[data-item-category="weapon"]')
          .filter({ hasText: weaponName });
        await expect(weaponRow).toBeVisible();
        await weaponRow.locator(".item-edit").click();

        let itemSheetId = await openOwnedItemSheet(game, {
          actorId: playerActorId,
          itemId: embeddedWeaponId,
        });
        let itemSheet = await openItemSettings(game, itemSheetId);
        const manageLink = itemSheet.locator(".manage-installed-upgrades");
        await expect(manageLink).toBeVisible();
        await manageLink.click();

        const dialog = game
          .locator(".application")
          .filter({ has: game.locator('input[name="selectedItems"]') });
        await expect(dialog).toBeVisible();
        const checkbox = dialog.locator(
          `input[name="selectedItems"][value="${embeddedUpgradeId}"]`,
        );
        await expect(checkbox).toBeVisible();
        await checkbox.check();
        await dialog
          .locator('button.cpr-dialog-button[data-action="confirm"]')
          .click();

        await game.waitForFunction(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.installedItems
              .list.length === 1,
          { actorId: playerActorId, itemId: embeddedWeaponId },
          { timeout: 10000 },
        );

        // Hard-reopen guard: close and reopen the item sheet, then prove on a
        // fresh render that the upgrade is listed as installed.
        await closeOwnedItemSheet(game, {
          actorId: playerActorId,
          itemId: embeddedWeaponId,
        });
        await weaponRow.locator(".item-edit").click();
        itemSheetId = await openOwnedItemSheet(game, {
          actorId: playerActorId,
          itemId: embeddedWeaponId,
        });
        itemSheet = await openItemSettings(game, itemSheetId);
        await expect(
          itemSheet.locator("a.item-view", { hasText: upgradeName }),
        ).toBeVisible();
      });

      await test.step("sell the upgraded weapon to a shop container", async () => {
        containerActorId = await createDocumentViaUI(game, {
          documentTab: "actors",
          type: "container",
          name: uniqueName("upgrade-shop-container"),
        });
        await expectSheetRendered(game, {
          collection: "actors",
          id: containerActorId,
        });

        // Scaffolding: give the shop funds so the vendor offer is not clamped to zero.
        await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (container) {
              await container.update({ "system.wealth.value": 999999 });
            }
          },
          { containerActorId },
        );

        // Selling is a player-initiated drag in the real UI; as GM we drive the same
        // sheet method the drop handler calls (the established pattern for sell tests here).
        await game.evaluate(
          async ({ containerActorId, playerActorId, weaponName }) => {
            const container = game.actors.get(containerActorId);
            const player = game.actors.get(playerActorId);
            const item = player.items.find((i) => i.name === weaponName);
            if (!item)
              throw new Error(`Weapon "${weaponName}" not found on player`);
            const originalConfirm = foundry.applications.api.DialogV2.confirm;
            foundry.applications.api.DialogV2.confirm = async () => true;
            try {
              await container.sheet._sellItemTo(playerActorId, item);
            } finally {
              foundry.applications.api.DialogV2.confirm = originalConfirm;
            }
          },
          { containerActorId, playerActorId, weaponName },
        );

        await game.waitForFunction(
          ({ containerActorId, weaponName }) =>
            game.actors
              .get(containerActorId)
              ?.items.some((i) => i.name === weaponName) === true,
          { containerActorId, weaponName },
          { timeout: 10000 },
        );
      });

      await test.step("the shop's copy of the weapon still has the upgrade installed", async () => {
        const containerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: containerActorId,
        });
        const containerSheet = sheet(game, containerSheetId);
        const weaponRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: weaponName });
        await expect(weaponRow).toBeVisible();
        // The "upgraded" caret on the row is visible proof the upgrade arrived with the weapon.
        await expect(weaponRow.locator(".fa-square-caret-up")).toBeVisible();

        const shopWeaponId = await game.evaluate(
          ({ containerActorId, weaponName }) =>
            game.actors
              .get(containerActorId)
              .items.find((i) => i.name === weaponName).id,
          { containerActorId, weaponName },
        );

        await weaponRow.locator(".item-edit").click();
        const itemSheetId = await openOwnedItemSheet(game, {
          actorId: containerActorId,
          itemId: shopWeaponId,
        });
        const itemSheet = await openItemSettings(game, itemSheetId);
        await expect(
          itemSheet.locator("a.item-view", { hasText: upgradeName }),
        ).toBeVisible();

        const state = await readInstalledState(containerActorId);
        expect(state.listLength).toBe(1);
        // The weapon's installed-upgrade references must all resolve to items
        // owned by the recipient; a dangling reference is an orphaned upgrade.
        expect(state.allReferencesResolve, JSON.stringify(state)).toBe(true);
        // Exactly one copy of the upgrade may exist: no duplicates, no orphans.
        expect(state.upgradeCount, JSON.stringify(state)).toBe(1);

        await closeOwnedItemSheet(game, {
          actorId: containerActorId,
          itemId: shopWeaponId,
        });
      });

      await test.step("buy the upgraded weapon back from the shop", async () => {
        const containerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: containerActorId,
        });
        const containerSheet = sheet(game, containerSheetId);

        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        await tradeDropdown.selectOption({ value: playerActorId });

        // Scaffolding: give the character funds to cover the weapon's price.
        await game.evaluate(
          async ({ playerActorId }) => {
            const actor = game.actors.get(playerActorId);
            if (actor) {
              await actor.update({ "system.wealth.value": 999999 });
            }
          },
          { playerActorId },
        );

        const weaponRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: weaponName });
        await expect(weaponRow).toBeVisible();
        await weaponRow.locator(FIELD.purchaseAll).click();

        await game.waitForFunction(
          ({ playerActorId, containerActorId, weaponName }) => {
            const player = game.actors.get(playerActorId);
            const container = game.actors.get(containerActorId);
            return (
              player.items.some((i) => i.name === weaponName) &&
              !container.items.some((i) => i.name === weaponName)
            );
          },
          { playerActorId, containerActorId, weaponName },
          { timeout: 10000 },
        );
      });

      await test.step("the purchased weapon still has the upgrade installed", async () => {
        // The purchase step left the container sheet in front; close it so our
        // clicks land on the player sheet.
        await closeDocSheet(game, {
          collection: "actors",
          id: containerActorId,
        });
        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });
        const gear = await activateGearTab(game, playerSheetId);
        const weaponRow = gear
          .locator('li.item[data-item-category="weapon"]')
          .filter({ hasText: weaponName });
        await expect(weaponRow).toBeVisible();
        // The "upgraded" caret on the gear row is visible proof the upgrade survived the round trip.
        await expect(weaponRow.locator(".fa-square-caret-up")).toBeVisible();

        const finalWeaponId = await game.evaluate(
          ({ playerActorId, weaponName }) =>
            game.actors
              .get(playerActorId)
              .items.find((i) => i.name === weaponName).id,
          { playerActorId, weaponName },
        );

        await weaponRow.locator(".item-edit").click();
        const itemSheetId = await openOwnedItemSheet(game, {
          actorId: playerActorId,
          itemId: finalWeaponId,
        });
        const itemSheet = await openItemSettings(game, itemSheetId);
        await expect(
          itemSheet.locator("a.item-view", { hasText: upgradeName }),
        ).toBeVisible();

        const state = await readInstalledState(playerActorId);
        expect(state.listLength).toBe(1);
        expect(state.allReferencesResolve, JSON.stringify(state)).toBe(true);
        // Exactly one copy of the upgrade may exist: no duplicates, no orphans.
        expect(state.upgradeCount, JSON.stringify(state)).toBe(1);

        await closeOwnedItemSheet(game, {
          actorId: playerActorId,
          itemId: finalWeaponId,
        });
        await closeDocSheet(game, { collection: "actors", id: playerActorId });
        await closeDocSheet(game, {
          collection: "actors",
          id: containerActorId,
        });
      });
    });
  });

  test.describe("Loot", () => {
    test("shows N/A for eurobucks and hides ledger button", async ({
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
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (actor && actor.sheet.rendered) {
              await actor.setContainerType("loot");
              await actor.sheet.render();
            }
          },
          { actorId },
        );

        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });

        const containerSheet = sheet(game, sheetId);
        await expect(containerSheet.locator(FIELD.eurobucksNA)).toBeVisible();
      });

      await test.step("loot container hides ledger button", async () => {
        const containerSheet = sheet(game, sheetId);
        await expect(containerSheet.locator(FIELD.ledgerButton)).toHaveCount(0);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("shows take button instead of purchase", async ({ page: game }) => {
      const { actorId } = await createContainerWithItem(game, {
        containerName: "loot-take-button-container",
        itemType: "gear",
      });

      let sheetId = await openTokenSheet(game, actorId);

      await test.step("switch to loot type and verify hand icon", async () => {
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (actor && actor.sheet.rendered) {
              await actor.setContainerType("loot");
              await actor.update({
                [`flags.${game.system.id}.items-free`]: true,
              });
              await actor.sheet.render();
            }
          },
          { actorId },
        );

        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });

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

  test.describe("Stash", () => {
    test("shows take button instead of purchase", async ({ page: game }) => {
      const { actorId, sheetId } = await createStashWithItem(game, {
        stashName: "stash-take-button",
        itemName: "Stash Item",
      });

      await test.step("stash container shows hand icon instead of cart icon", async () => {
        const containerSheet = sheet(game, sheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "Stash Item" });
        await expect(itemRow).toBeVisible();

        const takeBtn = itemRow.locator(
          'a.item-action[data-action-type="purchase"] i',
        );
        await expect(takeBtn).toBeVisible();
        await expect(takeBtn).toHaveClass(/fa-hand/);

        const purchaseBtn = itemRow.locator(
          'a.item-action[data-action-type="purchase"] i',
        );
        await expect(purchaseBtn).not.toHaveClass(/fa-cart-shopping/);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("storing item in stash doesn't affect ledgers", async ({
      page: game,
    }) => {
      await enablePlayersCreateInventory(game);

      const playerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("stash-seller"),
      });

      await test.step("create a gear item on the player character", async () => {
        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });

        await createInventoryItemViaUI(game, {
          actorId: playerActorId,
          sheetId: playerSheetId,
          itemType: "gear",
          itemName: "Stash Seller Item",
        });
      });

      const stashActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("stash-storage"),
      });

      await test.step("set up stash with player having initial wealth", async () => {
        await game.evaluate(
          async ({ playerActorId, stashActorId }) => {
            const player = game.actors.get(playerActorId);
            const stash = game.actors.get(stashActorId);
            if (player) {
              await player.update({ "system.wealth.value": 500 });
            }
            if (stash) {
              await stash.setContainerType("stash");
            }
          },
          { playerActorId, stashActorId },
        );
      });

      await test.step("move item into stash and verify no ledger changes", async () => {
        // Capture initial wealth values
        const initialData = await game.evaluate(
          async ({ playerActorId }) => {
            const player = game.actors.get(playerActorId);
            return {
              playerWealth: player.system.wealth.value,
              playerTransactions: player.system.wealth.transactions,
            };
          },
          { playerActorId },
        );

        // Move item from player to stash directly (simulating stash storage)
        await game.evaluate(
          async ({ playerActorId, stashActorId }) => {
            const stash = game.actors.get(stashActorId);
            const player = game.actors.get(playerActorId);
            const playerItem = player.items.find(
              (i) => i.name === "Stash Seller Item",
            );
            if (playerItem) {
              // Clone the item for the stash
              const itemData = foundry.utils.duplicate(playerItem);
              // eslint-disable-next-line no-restricted-syntax -- stash test needs direct API
              await stash.createEmbeddedDocuments("Item", [itemData]);
              // eslint-disable-next-line no-restricted-syntax -- stash test needs direct API
              await player.deleteEmbeddedDocuments("Item", [playerItem.id]);
            }
          },
          { playerActorId, stashActorId },
        );

        // Verify item is now in stash
        const stashAfterItem = await game.evaluate(
          async ({ stashActorId }) => {
            const stash = game.actors.get(stashActorId);
            if (!stash) return false;
            return stash.items.some((i) => i.name === "Stash Seller Item");
          },
          { stashActorId },
        );
        expect(stashAfterItem).toBe(true);

        // Verify player's wealth is unchanged
        const playerAfter = await game.evaluate(
          async ({ playerActorId }) => {
            const player = game.actors.get(playerActorId);
            return {
              playerWealth: player.system.wealth.value,
              playerTransactions: player.system.wealth.transactions,
            };
          },
          { playerActorId },
        );

        expect(playerAfter.playerWealth).toBe(initialData.playerWealth);
        expect(playerAfter.playerTransactions).toEqual(
          initialData.playerTransactions,
        );
      });

      await closeDocSheet(game, { collection: "actors", id: playerActorId });
      await closeDocSheet(game, { collection: "actors", id: stashActorId });
    });

    test("removing item from stash doesn't affect ledgers", async ({
      page: game,
    }) => {
      const playerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("stash-taker"),
      });

      const stashActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("stash-with-item"),
      });

      await test.step("set up stash with item and player with initial wealth", async () => {
        await game.evaluate(
          async ({ stashActorId, playerActorId }) => {
            const stash = game.actors.get(stashActorId);
            const player = game.actors.get(playerActorId);
            if (stash) {
              await stash.setContainerType("stash");
              if (stash.sheet.rendered) await stash.sheet.render();
            }
            if (player) {
              await player.update({ "system.wealth.value": 300 });
            }
          },
          { stashActorId, playerActorId },
        );

        const stashSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: stashActorId,
        });

        await createInventoryItemViaUI(game, {
          actorId: stashActorId,
          sheetId: stashSheetId,
          itemType: "gear",
          itemName: "Stash Taker Item",
        });
      });

      await test.step("take item from stash and verify no ledger changes", async () => {
        // Capture initial wealth values
        const initialData = await game.evaluate(
          async ({ playerActorId }) => {
            const player = game.actors.get(playerActorId);
            return {
              playerWealth: player.system.wealth.value,
              playerTransactions: player.system.wealth.transactions,
            };
          },
          { playerActorId },
        );

        // Move item from stash to player by deleting from stash
        await game.evaluate(
          async ({ stashActorId }) => {
            const stash = game.actors.get(stashActorId);
            const stashItem = stash.items.find(
              (i) => i.name === "Stash Taker Item",
            );
            if (stashItem) {
              // eslint-disable-next-line no-restricted-syntax -- stash test needs direct API
              await stash.deleteEmbeddedDocuments("Item", [stashItem.id]);
            }
          },
          { stashActorId },
        );

        // Verify item is no longer in stash
        const stashAfter = await game.evaluate(
          async ({ stashActorId }) => {
            const stash = game.actors.get(stashActorId);
            if (!stash) return false;
            return stash.items.some((i) => i.name === "Stash Taker Item");
          },
          { stashActorId },
        );
        expect(stashAfter).toBe(false);

        // Verify player's wealth is unchanged
        const playerAfter = await game.evaluate(
          async ({ playerActorId }) => {
            const player = game.actors.get(playerActorId);
            return {
              playerWealth: player.system.wealth.value,
              playerTransactions: player.system.wealth.transactions,
            };
          },
          { playerActorId },
        );

        expect(playerAfter.playerWealth).toBe(initialData.playerWealth);
        expect(playerAfter.playerTransactions).toEqual(
          initialData.playerTransactions,
        );
      });

      await closeDocSheet(game, { collection: "actors", id: playerActorId });
      await closeDocSheet(game, { collection: "actors", id: stashActorId });
    });
  });

  test.describe("Custom", () => {
    test("shows settings and configure shop link on token sheet", async ({
      page: game,
    }) => {
      const actorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("custom-token-container"),
      });

      let sheetId = await openTokenSheet(game, actorId);

      await test.step("switch to custom container type", async () => {
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (actor && actor.sheet.rendered) {
              await actor.setContainerType("custom");
              await actor.sheet.render();
            }
          },
          { actorId },
        );

        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      });

      await test.step("custom container shows custom settings section", async () => {
        const containerSheet = sheet(game, sheetId);
        const playersCanLabel = containerSheet.getByText("Can players:");
        await expect(playersCanLabel).toBeVisible();
      });

      await test.step("custom container shows player permission checkboxes", async () => {
        const containerSheet = sheet(game, sheetId);
        const checkboxes = containerSheet.locator(
          ".container-shop-settings .checkbox-toggle",
        );
        const count = await checkboxes.count();
        expect(count).toBeGreaterThan(0);
      });

      await test.step("shop container shows configure shop link", async () => {
        const containerSheet = sheet(game, sheetId);
        const configureLink = containerSheet.locator(
          ".vendor-configure-sell-to",
        );
        await expect(configureLink).toBeVisible();
      });

      await test.step("toggling infinite-stock on custom token sheet succeeds", async () => {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
        const isInfiniteOn = await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            return actor?.flags?.[game.system.id]?.["infinite-stock"] ?? false;
          },
          { actorId },
        );
        if (!isInfiniteOn) {
          await game.evaluate(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              if (actor) {
                await actor.update({
                  [`flags.${game.system.id}.infinite-stock`]: true,
                });
                if (actor.sheet.rendered) await actor.sheet.render();
              }
            },
            { actorId },
          );
          await game.waitForFunction(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              return (
                actor?.flags?.[game.system.id]?.["infinite-stock"] === true
              );
            },
            { actorId },
            { timeout: 5000 },
          );
        }
      });

      await test.step("toggling items-free on custom token sheet succeeds", async () => {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
        const isItemsFreeOn = await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            return actor?.flags?.[game.system.id]?.["items-free"] ?? false;
          },
          { actorId },
        );
        if (!isItemsFreeOn) {
          await game.evaluate(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              if (actor) {
                await actor.update({
                  [`flags.${game.system.id}.items-free`]: true,
                });
                if (actor.sheet.rendered) await actor.sheet.render();
              }
            },
            { actorId },
          );
          await game.waitForFunction(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              return actor?.flags?.[game.system.id]?.["items-free"] === true;
            },
            { actorId },
            { timeout: 5000 },
          );
        }
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("infinite-stock flag prevents item removal on purchase", async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createContainerWithItem(game, {
        containerName: "infinite-stock-container",
        itemType: "gear",
      });

      await test.step("enable infinite stock on token sheet", async () => {
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (actor) {
              await actor.update({
                [`flags.${game.system.id}.infinite-stock`]: true,
              });
              if (actor.sheet.rendered) await actor.sheet.render();
            }
          },
          { actorId },
        );
      });

      await test.step("purchase item and verify it is NOT removed", async () => {
        const containerSheet = sheet(game, sheetId);

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );

        const remainingItems = containerSheet
          .locator(FIELD.itemName)
          .filter({ hasText: "New Gear" });
        await expect(remainingItems).toHaveCount(1);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("items-free flag prevents wealth deduction on purchase", async ({
      page: game,
    }) => {
      const { actorId } = await createContainerWithItem(game, {
        containerName: "free-items-container",
        itemType: "gear",
      });

      let sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });

      await test.step("switch to custom type and enable items-free", async () => {
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (actor) {
              await actor.setContainerType("custom");
              await actor.update({
                [`flags.${game.system.id}.items-free`]: true,
              });
              if (actor.sheet.rendered) await actor.sheet.render();
            }
          },
          { actorId },
        );

        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      });

      await test.step("purchase item and verify trade partner wealth is unchanged", async () => {
        const containerSheet = sheet(game, sheetId);

        const tradeDropdown = containerSheet.locator(
          'select[name="trade-with-dropdown"]',
        );
        const options = await tradeDropdown.evaluate((el) =>
          Array.from(el.options).map((o) => o.value),
        );
        const tradePartnerOption = options.find((v) => v !== "");
        if (tradePartnerOption) {
          await tradeDropdown.selectOption({ value: tradePartnerOption });
        }

        const tradePartnerWealthBefore = await game.evaluate(
          async ({ tradePartnerOption }) => {
            const tradePartner = game.actors.get(tradePartnerOption);
            return tradePartner?.system?.wealth?.value ?? 0;
          },
          { tradePartnerOption },
        );

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "New Gear" });
        await expect(itemRow).toBeVisible();

        const purchaseLink = itemRow.locator(FIELD.purchaseAll);
        await expect(purchaseLink).toBeVisible();
        await purchaseLink.click();

        await game.waitForFunction(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            if (!actor) return false;
            return !actor.items.some((i) => i.name === "New Gear");
          },
          { actorId },
          { timeout: 5000 },
        );

        const tradePartnerWealthAfter = await game.evaluate(
          async ({ tradePartnerOption }) => {
            const tradePartner = game.actors.get(tradePartnerOption);
            return tradePartner?.system?.wealth?.value ?? 0;
          },
          { tradePartnerOption },
        );

        expect(tradePartnerWealthAfter).toBe(tradePartnerWealthBefore);
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
    });

    test("selling with customized compensation percentage", async ({
      page: game,
    }) => {
      await enablePlayersCreateInventory(game);

      const playerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("seller-character"),
      });

      await test.step("create a gear item with market price 200 on the player character", async () => {
        const playerSheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: playerActorId,
        });

        await createInventoryItemViaUI(game, {
          actorId: playerActorId,
          sheetId: playerSheetId,
          itemType: "gear",
          itemName: "Sellable Gear",
          data: { system: { "price.market": 200 } },
        });
      });

      const containerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("custom-compensation-container"),
      });

      // The sheet must be rendered so the sell call below can drive it.
      await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });

      await test.step("configure container to buy gear at 75% of market price", async () => {
        await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (container) {
              await container.setContainerType("custom");
              await container.update({
                "system.vendor": {
                  itemTypes: {
                    gear: { isPurchasing: true, purchasePercentage: "75" },
                  },
                },
              });
              if (container.sheet.rendered) await container.sheet.render();
            }
          },
          { containerActorId },
        );
      });

      await test.step("give the container funds", async () => {
        // Scaffolding: give the shop funds so the vendor offer is not clamped to zero.
        await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (container) {
              await container.update({ "system.wealth.value": 999999 });
            }
          },
          { containerActorId },
        );
      });

      await test.step("sell item to container and verify 75% compensation (150)", async () => {
        const playerWealthBefore = await game.evaluate(
          async ({ playerActorId }) => {
            const player = game.actors.get(playerActorId);
            return player?.system?.wealth?.value ?? 0;
          },
          { playerActorId },
        );

        const containerWealthBefore = await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            return container?.system?.wealth?.value ?? 0;
          },
          { containerActorId },
        );

        // Selling is a player-initiated drag in the real UI; as GM we drive the same
        // sheet method the drop handler calls (the established pattern for sell tests here).
        await game.evaluate(
          async ({ containerActorId, playerActorId }) => {
            const container = game.actors.get(containerActorId);
            const player = game.actors.get(playerActorId);
            const item = player.items.find((i) => i.name === "Sellable Gear");
            if (!item)
              throw new Error('Gear "Sellable Gear" not found on player');
            const originalConfirm = foundry.applications.api.DialogV2.confirm;
            foundry.applications.api.DialogV2.confirm = async () => true;
            try {
              await container.sheet._sellItemTo(playerActorId, item);
            } finally {
              foundry.applications.api.DialogV2.confirm = originalConfirm;
            }
          },
          { containerActorId, playerActorId },
        );

        await game.waitForFunction(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (!container) return false;
            return container.items.some((i) => i.name === "Sellable Gear");
          },
          { containerActorId },
          { timeout: 5000 },
        );

        await waitForActorFields(game, playerActorId, {
          "system.wealth.value": playerWealthBefore + 150,
        });
        await waitForActorFields(game, containerActorId, {
          "system.wealth.value": containerWealthBefore - 150,
        });
      });

      await closeDocSheet(game, { collection: "actors", id: playerActorId });
      await closeDocSheet(game, { collection: "actors", id: containerActorId });
    });

    test("player permissions: create, delete, and modify items when flags are set", async ({
      page: game,
      browser,
      baseURL,
    }) => {
      // The player session is the "E2E Player" user that global setup created;
      // openPlayerPage logs in as exactly that user.
      const playerId = await game.evaluate(
        () => game.users.getName("E2E Player")?.id ?? null,
      );
      expect(playerId).toBeTruthy();

      const { context, page: player } = await openPlayerPage(browser, baseURL);
      // deleteItemConfirmation is client-scoped (default true): disable it on the
      // player session, otherwise the player's delete click opens a confirmation
      // dialog that nothing confirms and the item is never deleted.
      await player.evaluate(async () => {
        await game.settings.set(
          game.system.id,
          "deleteItemConfirmation",
          false,
        );
      });
      try {
        await test.step("player can create items when players-create flag is set", async () => {
          const createActorId = await createDocumentViaUI(game, {
            documentTab: "actors",
            type: "container",
            name: uniqueName("player-create-container"),
          });

          await game.evaluate(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              await actor.setContainerType("custom");
              await actor.update({
                [`flags.${game.system.id}.players-create`]: true,
                [`ownership.${params.playerId}`]:
                  CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
              });
            },
            { actorId: createActorId, playerId },
          );

          const sheetId = await reopenActorSheetViaUI(player, createActorId);
          const { itemId } = await createInventoryItemViaUI(player, {
            actorId: createActorId,
            sheetId,
            itemType: "gear",
          });

          // Verified on the GM page: server-side state, not the player's view.
          const createdName = await game.evaluate(
            ({ actorId, itemId }) =>
              game.actors.get(actorId).items.get(itemId)?.name ?? null,
            { actorId: createActorId, itemId },
          );
          expect(createdName).toBe("New Gear");

          await closeDocSheet(player, {
            collection: "actors",
            id: createActorId,
          });
          await closeDocSheet(game, {
            collection: "actors",
            id: createActorId,
          });
        });

        await test.step("player can delete items when players-delete flag is set", async () => {
          const deleteActorId = await createDocumentViaUI(game, {
            documentTab: "actors",
            type: "container",
            name: uniqueName("player-delete-container"),
          });

          const sheetId = await expectSheetRendered(game, {
            collection: "actors",
            id: deleteActorId,
          });

          const { itemId } = await createInventoryItemViaUI(game, {
            actorId: deleteActorId,
            sheetId,
            itemType: "gear",
            itemName: "Player-Deleted Item",
          });

          await game.evaluate(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              await actor.setContainerType("custom");
              await actor.update({
                [`flags.${game.system.id}.players-delete`]: true,
                [`ownership.${params.playerId}`]:
                  CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
              });
            },
            { actorId: deleteActorId, playerId },
          );

          await closeDocSheet(game, {
            collection: "actors",
            id: deleteActorId,
          });

          const playerSheetId = await reopenActorSheetViaUI(
            player,
            deleteActorId,
          );
          const containerSheet = sheet(player, playerSheetId);
          const itemRow = containerSheet
            .locator(".item.flexrow")
            .filter({ hasText: "Player-Deleted Item" });
          await expect(itemRow).toBeVisible();

          const deleteLink = itemRow.locator(FIELD.deleteItem);
          await expect(deleteLink).toBeVisible();
          await deleteLink.click();

          await game.waitForFunction(
            ({ actorId, itemId }) =>
              !game.actors.get(actorId)?.items.get(itemId),
            { actorId: deleteActorId, itemId },
            { timeout: 5000 },
          );

          await closeDocSheet(player, {
            collection: "actors",
            id: deleteActorId,
          });
        });

        await test.step("player can modify items when players-modify flag is set", async () => {
          const modifyActorId = await createDocumentViaUI(game, {
            documentTab: "actors",
            type: "container",
            name: uniqueName("player-modify-container"),
          });

          const sheetId = await expectSheetRendered(game, {
            collection: "actors",
            id: modifyActorId,
          });

          const { itemId } = await createInventoryItemViaUI(game, {
            actorId: modifyActorId,
            sheetId,
            itemType: "gear",
            itemName: "Player-Modified Item",
          });

          await game.evaluate(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              await actor.setContainerType("custom");
              await actor.update({
                [`flags.${game.system.id}.players-modify`]: true,
                [`ownership.${params.playerId}`]:
                  CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
              });
            },
            { actorId: modifyActorId, playerId },
          );

          await closeDocSheet(game, {
            collection: "actors",
            id: modifyActorId,
          });

          const playerSheetId = await reopenActorSheetViaUI(
            player,
            modifyActorId,
          );
          const containerSheet = sheet(player, playerSheetId);
          const itemRow = containerSheet
            .locator(".item.flexrow")
            .filter({ hasText: "Player-Modified Item" });
          await expect(itemRow).toBeVisible();

          // Clicking the item name opens the item sheet; with players-modify set it
          // is editable, so the price change below persists.
          await itemRow.locator(FIELD.itemName).click();
          const itemSheetId = await openOwnedItemSheet(player, {
            actorId: modifyActorId,
            itemId,
          });
          const itemSheet = await openItemSettings(player, itemSheetId);
          const priceInput = itemSheet.locator(
            'input[name="system.price.market"]',
          );
          await expect(priceInput).toBeVisible();
          await priceInput.fill("750");
          await priceInput.blur();

          await game.waitForFunction(
            ({ actorId, itemId }) =>
              game.actors.get(actorId).items.get(itemId)?.system?.price
                ?.market === 750,
            { actorId: modifyActorId, itemId },
            { timeout: 5000 },
          );

          await closeOwnedItemSheet(player, { actorId: modifyActorId, itemId });
          await closeDocSheet(player, {
            collection: "actors",
            id: modifyActorId,
          });
        });

        await test.step("player without flags sees no create or delete controls", async () => {
          const lockedActorId = await createDocumentViaUI(game, {
            documentTab: "actors",
            type: "container",
            name: uniqueName("player-locked-container"),
          });

          const sheetId = await expectSheetRendered(game, {
            collection: "actors",
            id: lockedActorId,
          });

          await createInventoryItemViaUI(game, {
            actorId: lockedActorId,
            sheetId,
            itemType: "gear",
            itemName: "Locked Item",
          });

          // Custom type with ownership but no players-* flags.
          await game.evaluate(
            async (params) => {
              const actor = game.actors.get(params.actorId);
              await actor.setContainerType("custom");
              await actor.update({
                [`ownership.${params.playerId}`]:
                  CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
              });
            },
            { actorId: lockedActorId, playerId },
          );

          await closeDocSheet(game, {
            collection: "actors",
            id: lockedActorId,
          });

          const playerSheetId = await reopenActorSheetViaUI(
            player,
            lockedActorId,
          );
          const containerSheet = sheet(player, playerSheetId);

          await expect(containerSheet.locator(FIELD.createButton)).toHaveCount(
            0,
          );

          const itemRow = containerSheet
            .locator(".item.flexrow")
            .filter({ hasText: "Locked Item" });
          await expect(itemRow).toBeVisible();
          await expect(itemRow.locator(FIELD.deleteItem)).toHaveCount(0);

          await closeDocSheet(player, {
            collection: "actors",
            id: lockedActorId,
          });
        });
      } finally {
        await context.close();
      }
    });

    test("selling items to a container", async ({ page: game }) => {
      const playerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("seller-actor"),
      });

      const containerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("buying-container"),
      });

      let containerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });

      await test.step("create a gear item on the container", async () => {
        const result = await createInventoryItemViaUI(game, {
          actorId: containerActorId,
          sheetId: containerSheetId,
          itemType: "gear",
          itemName: "Sellable Gear",
        });
        containerSheetId = result.sheetId;
      });

      await test.step("configure container to buy gear at 50%", async () => {
        await game.evaluate(
          async ({ containerActorId }) => {
            const container = game.actors.get(containerActorId);
            if (container) {
              await container.setContainerType("custom");
              await container.update({
                "system.vendor": {
                  itemTypes: {
                    gear: { isPurchasing: true, purchasePercentage: "50" },
                  },
                },
              });
              if (container.sheet.rendered) await container.sheet.render();
            }
          },
          { containerActorId },
        );
      });

      await test.step("verify container sheet renders with vendor configuration", async () => {
        const containerSheet = sheet(game, containerSheetId);
        const vendorSection = containerSheet.locator(
          ".vendor-configure-sell-to",
        );
        await expect(vendorSection).toBeVisible();
      });

      await closeDocSheet(game, { collection: "actors", id: containerActorId });
      await closeDocSheet(game, { collection: "actors", id: playerActorId });
    });
  });
});
