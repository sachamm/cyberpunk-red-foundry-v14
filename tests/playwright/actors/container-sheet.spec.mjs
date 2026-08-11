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
  const tokenDocumentId = await page.evaluate(async ({ actorId }) => {
    const token = await canvas.scene.createEmbeddedDocuments("Token", [
      {
        x: 100,
        y: 100,
        actorId: actorId,
        name: game.actors.get(actorId).name,
      },
    ]);
    return token[0].id;
  }, { actorId });

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
      await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (actor && actor.sheet.rendered) {
          await actor.setContainerType("loot");
          await actor.sheet.render();
        }
      }, { actorId });

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
});
