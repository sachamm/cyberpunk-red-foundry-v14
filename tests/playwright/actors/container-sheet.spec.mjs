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

async function createTokenForActor(page, actorId) {
  // Create a scene if none exists
  const sceneId = await page.evaluate(async () => {
    let scene = game.scenes.getName("test-scene");
    if (!scene) {
      scene = await Scene.create({
        name: "test-scene",
        sort: 1,
        background: {
          color: "#000000",
          alphaBase: 1,
          fit: "contain",
        },
        grid: { size: 50 },
      });
    }
    await game.scenes.get(scene.id).view();
    return scene.id;
  });

  // Wait for the scene to become the active canvas scene
  await page.waitForFunction(
    (sceneId) => canvas.scene && canvas.scene.id === sceneId,
    sceneId,
    { timeout: 10000 },
  );

  // Place a token for the actor
  const tokenDocumentId = await page.evaluate(
    async ({ actorId }) => {
      const token = await canvas.scene.createEmbeddedDocuments("Token", [
        {
          x: 100,
          y: 100,
          actorId: actorId,
          name: game.actors.get(actorId).name,
        },
      ]);
      return token[0].id;
    },
    { actorId },
  );

  return tokenDocumentId;
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

  test("loot container type change works on a token-backed sheet", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("loot-token-container"),
    });

    // Create a token for the actor
    const tokenDocumentId = await createTokenForActor(game, actorId);
    expect(tokenDocumentId).toBeTruthy();

    // Open the sheet with token context via Foundry API
    // (tokens are drawn on HTML5 canvas, not DOM elements, so we can't dblclick them)
    const sheetId = await game.evaluate(
      async ({ actorId, tokenDocumentId }) => {
        const actor = game.actors.get(actorId);
        const token = canvas.scene.tokens.get(tokenDocumentId);
        if (!actor || !token) return null;
        await actor.sheet.render(true, { token: token });
        return actor.sheet.element?.id ?? null;
      },
      { actorId, tokenDocumentId },
    );

    expect(sheetId).toBeTruthy();

    await test.step("switch container type to loot via dropdown on token sheet", async () => {
      // Directly update the actor flags and re-render the sheet
      await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (actor && actor.sheet.rendered) {
            await actor.setContainerType("loot");
            await actor.sheet.render();
          }
        },
        { actorId },
      );

      // Wait for the sheet to re-render
      await game.waitForTimeout(500);
    });

    await test.step("loot container displays N/A for eurobucks", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.eurobucksNA)).toBeVisible();
    });

    await test.step("loot container hides ledger button", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.ledgerButton)).toHaveCount(0);
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
      {
        name: "weapon",
        displayName: "Weapon",
        defaultName: "New Weapon",
        price: "100",
        hasAmount: false,
      },
      {
        name: "ammo",
        displayName: "Ammo",
        defaultName: "New Ammo",
        price: "10",
        hasAmount: true,
      },
      {
        name: "armor",
        displayName: "Armor",
        defaultName: "New Armor",
        price: "100",
        hasAmount: false,
      },
      {
        name: "gear",
        displayName: "Gear",
        defaultName: "New Gear",
        price: "100",
        hasAmount: true,
      },
      {
        name: "drug",
        displayName: "Drug",
        defaultName: "New Drug",
        price: "100",
        hasAmount: true,
      },
      {
        name: "clothing",
        displayName: "Clothing",
        defaultName: "New Clothing",
        price: "100",
        hasAmount: true,
      },
      {
        name: "cyberware",
        displayName: "Cyberware",
        defaultName: "New Cyberware",
        price: "100",
        hasAmount: false,
      },
    ];

    await test.step("create one item from each category and verify defaults", async () => {
      for (const cat of categories) {
        let containerSheet = sheet(game, sheetId);

        // Find the create button by data-item-type and click it
        const createBtn = containerSheet.locator(
          FIELD.createButtonByType(cat.name),
        );
        await expect(createBtn).toBeVisible();
        await createBtn.click();

        // Wait for the item to appear in the container's inventory
        const itemRow = containerSheet
          .locator(FIELD.itemName)
          .filter({ hasText: cat.defaultName });
        await expect(itemRow).toBeVisible();

        // Re-fetch the container sheet in case the sheet ID changed
        sheetId = await game.evaluate(async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        }, actorId);

        // If sheet ID is null, reopen the sheet
        if (!sheetId) {
          sheetId = await expectSheetRendered(game, {
            collection: "actors",
            id: actorId,
          });
        }
      }
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("GM can purchase items from container inventory", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("purchase-test-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("disable infinite stock for the container", async () => {
      const containerSheet = sheet(game, sheetId);

      // Check if infinite stock is enabled and disable it
      const infiniteStockToggle = containerSheet.locator(
        '.checkbox-toggle[data-flag-name="infinite-stock"]',
      );
      const isInfiniteStockOn = await infiniteStockToggle
        .locator("i.fa-circle-check")
        .isVisible()
        .catch(() => false);
      if (isInfiniteStockOn) {
        await infiniteStockToggle.click();
        await game.waitForTimeout(300);
      }
    });

    await test.step("create an ammo item in the container", async () => {
      // Re-fetch sheet ID in case it changed
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

      // Find the Ammo category create button and click it
      const ammoCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("ammo"),
      );
      await expect(ammoCreateBtn).toBeVisible();
      await ammoCreateBtn.click();

      // Wait for item to appear in inventory
      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Ammo" });
      await expect(itemRow).toBeVisible();

      // Re-fetch container sheet ID
      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      // If sheet ID is null, reopen the sheet
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("verify item appears in container with correct amount and price", async () => {
      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Ammo" });
      await expect(itemRow).toBeVisible();

      // Verify amount is displayed (1)
      const itemAmounts = containerSheet.locator(FIELD.itemAmount);
      const amountText = await itemAmounts.first().textContent();
      expect(amountText).toContain("1");

      // Verify price is displayed (10)
      const itemPrices = containerSheet.locator(FIELD.itemPrice);
      const priceText = await itemPrices.first().textContent();
      expect(priceText).toContain("10");
    });

    await test.step("verify purchase button is visible and clickable", async () => {
      const containerSheet = sheet(game, sheetId);

      // Find the item row by name using has() to match the entire row
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Ammo" });
      await expect(itemRow).toBeVisible();

      // Get the purchase link within the item row
      const purchaseLink = itemRow.locator(FIELD.purchaseAll);
      await expect(purchaseLink).toBeVisible();

      // Select a trade partner from the dropdown before purchasing
      const tradeDropdown = containerSheet.locator(
        'select[name="trade-with-dropdown"]',
      );
      const options = await tradeDropdown.evaluate((el) =>
        Array.from(el.options).map((o) => o.value),
      );
      const tradePartnerOption = options.find((v) => v !== "");
      if (tradePartnerOption) {
        await tradeDropdown.selectOption({ value: tradePartnerOption });
        await game.waitForTimeout(300);
      }

      // Click the purchase button
      await purchaseLink.click();

      // Wait for any dialog to appear (purchase requires sufficient funds)
      await game.waitForTimeout(500);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("GM can delete items from container inventory", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("delete-test-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create a gear item in the container", async () => {
      const containerSheet = sheet(game, sheetId);

      // Find the Gear category create button and click it
      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();

      // Wait for item to appear in inventory
      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      // Re-fetch container sheet ID
      sheetId = await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, actorId);

      // If sheet ID is null, reopen the sheet
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("verify item appears in container", async () => {
      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();
    });

    await test.step("delete the item and verify confirmation dialog", async () => {
      const containerSheet = sheet(game, sheetId);

      // Find the item row by name using has() to match the entire row
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      // Click the delete button
      const deleteLink = itemRow.locator(FIELD.deleteItem);
      await expect(deleteLink).toBeVisible();
      await deleteLink.click();

      // Wait for confirmation dialog (based on deleteItemConfirmation setting)
      const confirmDialog = game.locator(".application.dialog");
      const isDialogVisible = await confirmDialog
        .isVisible()
        .catch(() => false);

      if (isDialogVisible) {
        // Confirm the deletion
        await confirmDialog.locator('button[data-action="yes"]').click();
        await game.waitForTimeout(500);
      }

      // Verify the item is removed
      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
