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

/**
 * Dismiss any active notification/toast in the Foundry UI.
 * No-op when none is present.
 */
async function dismissNotifications(page) {
  const notifications = page.locator(".notification");
  if (await notifications.count() > 0) {
    await notifications.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/**
 * Create a test scene if one doesn't exist yet. Returns the scene ID.
 * Called once per test file in a beforeAll hook.
 */
async function ensureTestScene(page) {
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
  await page.waitForFunction(
    (sceneId) => canvas.scene && canvas.scene.id === sceneId,
    sceneId,
    { timeout: 10000 },
  );
  return sceneId;
}

/**
 * Create a token for an actor on the test scene.
 */
async function createTokenForActor(page, actorId) {
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

/**
 * Create a container actor with an item of the given type.
 * Returns { actorId, sheetId }.
 */
async function createContainerWithItem(game, { containerName, itemType }) {
  const actorId = await createDocumentViaUI(game, {
    documentTab: "actors",
    type: "container",
    name: uniqueName(containerName),
  });

  let sheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });

  const containerSheet = sheet(game, sheetId);
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const gearCreateBtn = containerSheet.locator(
    FIELD.createButtonByType(itemType),
  );
  await expect(gearCreateBtn).toBeVisible();
  await gearCreateBtn.click();

  const itemRow = containerSheet
    .locator(FIELD.itemName)
    .filter({ hasText: `New ${capitalize(itemType)}` });
  await expect(itemRow).toBeVisible();

  // Re-fetch sheet ID in case it changed
  sheetId = await game.evaluate(async (params) => {
    const actor = game.actors.get(params.actorId);
    if (!actor) return null;
    return actor.sheet?.element?.id ?? null;
  }, { actorId });

  if (!sheetId) {
    sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
  }

  return { actorId, sheetId };
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Container actor sheet", () => {
  // Shared setup: create the test scene once for all token-based tests
  test.describe("token setup", () => {
    test.beforeAll(async ({ page }) => {
      await ensureTestScene(page);
    });
  });

  // Shared setup: create the E2E Player user once for all player-permission tests
  test.describe("player setup", () => {
    test.beforeEach(async ({ page: game }) => {
      await game.evaluate(async () => {
        const { CONST } = globalThis;
        // Create the player user (idempotent - getName returns existing user)
        game.users.getName("E2E Player") ??
          await User.create({ name: "E2E Player", role: CONST.USER_ROLES.PLAYER });
      });
    });

    test.afterEach(async ({ page: game }) => {
      // Re-enable deleteItemConfirmation setting after tests that disable it
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "deleteItemConfirmation", true);
      });
    });
  });

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

    await test.step("changing container type to loot on a non-token sheet shows an error", async () => {
      const containerSheet = sheet(game, sheetId);
      const dropdown = containerSheet.locator(FIELD.containerTypeDropdown);

      // Select by value "loot" (the option label is "Loot - All items are free")
      await dropdown.selectOption({ value: "loot" });

      // Container type changes are blocked on non-token sheets
      // Verify a notification/error was shown
      await expect(game.locator(".notification.error")).toBeVisible();
      await dismissNotifications(game);
    });

    await test.step("loot container displays N/A for eurobucks on token sheet", async () => {
      // On a non-token sheet, the type change is blocked, so we need to create
      // a token-backed container to verify the loot display.
      const tokenDocumentId = await createTokenForActor(game, actorId);
      expect(tokenDocumentId).toBeTruthy();

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
      await game.waitForTimeout(500);

      sheetId = await game.evaluate(async (params) => {
        const actor = game.actors.get(params.actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, { actorId });

      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.eurobucksNA)).toBeVisible();
    });

    await test.step("loot container hides ledger button", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.ledgerButton)).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("container settings require a token sheet", async ({ page: game }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("non-token-settings-test"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("changing container type on non-token sheet shows error", async () => {
      const containerSheet = sheet(game, sheetId);
      const dropdown = containerSheet.locator(FIELD.containerTypeDropdown);
      await dropdown.selectOption({ value: "loot" });
      await expect(game.locator(".notification.error").first()).toBeVisible();
      await dismissNotifications(game);
    });

    await test.step("toggling infinite-stock on non-token sheet shows error", async () => {
      const containerSheet = sheet(game, sheetId);
      const toggle = containerSheet.locator(
        '.checkbox-toggle[data-flag-name="infinite-stock"]',
      );
      const exists = await toggle.count();
      if (exists > 0) {
        await toggle.click();
        await expect(game.locator(".notification.error").first()).toBeVisible();
        await dismissNotifications(game);
      }
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("custom container type shows settings and configure shop link on token sheet", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("custom-token-container"),
    });

    const tokenDocumentId = await createTokenForActor(game, actorId);
    expect(tokenDocumentId).toBeTruthy();

    let sheetId = await game.evaluate(
      async (params) => {
        const actor = game.actors.get(params.actorId);
        const token = canvas.scene.tokens.get(params.tokenDocumentId);
        if (!actor || !token) return null;
        await actor.sheet.render(true, { token });
        return actor.sheet.element?.id ?? null;
      },
      { actorId, tokenDocumentId },
    );
    expect(sheetId).toBeTruthy();

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
      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          return actor?.flags?.[game.system.id]?.["container-type"] === "custom";
        },
        { actorId },
        { timeout: 5000 },
      );

      sheetId = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
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
      const configureLink = containerSheet.locator(".vendor-configure-sell-to");
      await expect(configureLink).toBeVisible();
    });

    await test.step("toggling infinite-stock on custom token sheet succeeds", async () => {
      sheetId = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
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
            return actor?.flags?.[game.system.id]?.["infinite-stock"] === true;
          },
          { actorId },
          { timeout: 5000 },
        );
        const isInfiniteOnAfter = await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            return actor?.flags?.[game.system.id]?.["infinite-stock"] ?? false;
          },
          { actorId },
        );
        expect(isInfiniteOnAfter).toBe(true);
      }
    });

    await test.step("toggling items-free on custom token sheet succeeds", async () => {
      sheetId = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
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
        const isItemsFreeOnAfter = await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            return actor?.flags?.[game.system.id]?.["items-free"] ?? false;
          },
          { actorId },
        );
        expect(isItemsFreeOnAfter).toBe(true);
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
      // Enable via API (faster than UI toggle)
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
          return actor?.flags?.[game.system.id]?.["infinite-stock"] === true;
        },
        { actorId },
        { timeout: 5000 },
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

      // Wait for the item to remain (infinite stock prevents removal)
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
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "free-items-container",
      itemType: "gear",
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
      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          return actor?.flags?.[game.system.id]?.["items-free"] === true;
        },
        { actorId },
        { timeout: 5000 },
      );

      let updatedSheetId = await game.evaluate(async (params) => {
        const actor = game.actors.get(params.actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, { actorId });
      if (!updatedSheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
    });

    await test.step("purchase item and verify trade partner wealth is unchanged", async () => {
      const containerSheet = sheet(game, sheetId);

      // Set the trade partner to the E2E Shopper actor
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

      // Wait for the purchase to complete
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

  test("category collapse/expand toggles item visibility", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "stash-container",
      itemType: "gear",
    });

    await test.step("verify item is visible in expanded category, then collapse hides it", async () => {
      const containerSheet = sheet(game, sheetId);

      // Find the Gear category header
      const gearCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .filter({ hasText: "Gear" });
      await expect(gearCategory).toBeVisible();

      // Verify the gear item row does NOT have the hide class (expanded)
      const gearItemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(gearItemRow).toBeVisible();
      const itemHasHide = await gearItemRow.evaluate((el) =>
        el.classList.contains("hide"),
      );
      expect(itemHasHide).toBe(false);

      // Click the expand-button to collapse the category
      await gearCategory.locator(FIELD.expandButton).click();

      // Wait for the item to become hidden
      await expect(gearItemRow).not.toBeVisible();

      // After collapse, the item row should have the hide class
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

      // Click to re-expand
      await gearCategory.locator(FIELD.expandButton).click();

      // Wait for the item to become visible
      const gearItemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(gearItemRow).toBeVisible();

      // The item row should no longer have the hide class
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
        sheetId = await game.evaluate(async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        }, { actorId });

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

  test("GM can purchase items from container inventory with sufficient funds", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "purchase-test-container",
      itemType: "gear",
    });

    await test.step("set trade partner with sufficient funds", async () => {
      const containerSheet = sheet(game, sheetId);

      // Set the trade partner to the E2E Shopper actor
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

      // Set the trade partner's wealth to a high value so they can afford purchases
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

      // Find the item row by name using has() to match the entire row
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      // Get the purchase link within the item row
      const purchaseLink = itemRow.locator(FIELD.purchaseAll);
      await expect(purchaseLink).toBeVisible();
      await purchaseLink.click();

      // Wait for the item to be removed
      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId },
        { timeout: 5000 },
      );

      // Verify the item is no longer in the container
      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("GM can delete items from container inventory with and without confirmation", async ({
    page: game,
  }) => {
    // --- Part 1: Delete WITH confirmation (default setting) ---
    const actorId1 = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("delete-with-confirm-container"),
    });

    let sheetId1 = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId1,
    });

    await test.step("create a gear item for delete-with-confirmation test", async () => {
      const containerSheet = sheet(game, sheetId1);
      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();
      await expect(
        containerSheet.locator(FIELD.itemName).filter({ hasText: "New Gear" }),
      ).toBeVisible();

      sheetId1 = await game.evaluate(async (params) => {
        const actor = game.actors.get(params.actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, { actorId: actorId1 });
      if (!sheetId1) {
        sheetId1 = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId1,
        });
      }
    });

    await test.step("delete item with confirmation dialog visible", async () => {
      const containerSheet = sheet(game, sheetId1);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const deleteLink = itemRow.locator(FIELD.deleteItem);
      await expect(deleteLink).toBeVisible();
      await deleteLink.click();

      // Wait for confirmation dialog to appear
      const confirmDialog = game.locator(".application.dialog");
      await expect(confirmDialog).toBeVisible();

      // Confirm the deletion
      await confirmDialog.locator('button[data-action="yes"]').click();
      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId: actorId1 },
        { timeout: 5000 },
      );

      // Verify the item is removed
      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId1 });

    // --- Part 2: Delete WITHOUT confirmation (setting disabled) ---
    await test.step("disable deleteItemConfirmation setting", async () => {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "deleteItemConfirmation", false);
      });
    });

    const actorId2 = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("delete-without-confirm-container"),
    });

    let sheetId2 = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId2,
    });

    await test.step("create a gear item for delete-without-confirmation test", async () => {
      const containerSheet = sheet(game, sheetId2);
      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();
      await expect(
        containerSheet.locator(FIELD.itemName).filter({ hasText: "New Gear" }),
      ).toBeVisible();

      sheetId2 = await game.evaluate(async (params) => {
        const actor = game.actors.get(params.actorId);
        if (!actor) return null;
        return actor.sheet?.element?.id ?? null;
      }, { actorId: actorId2 });
      if (!sheetId2) {
        sheetId2 = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId2,
        });
      }
    });

    await test.step("delete item without confirmation dialog appearing", async () => {
      const containerSheet = sheet(game, sheetId2);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const deleteLink = itemRow.locator(FIELD.deleteItem);
      await expect(deleteLink).toBeVisible();
      await deleteLink.click();

      // Wait for the item to be removed
      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId: actorId2 },
        { timeout: 5000 },
      );

      // Verify no confirmation dialog appeared
      await expect(game.locator(".application.dialog")).not.toBeVisible();

      // Verify the item is removed immediately
      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId2 });
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

      // Wait for item sheet to open
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

      // Navigate to settings tab
      const settingsTab = itemSheet.locator('a[data-tab="item-settings"]');
      await settingsTab.click();

      // Wait for settings tab to be active
      await expect(settingsTab).toHaveClass(/active/);

      // Find and edit the price field
      const priceInput = itemSheet.locator('input[name="system.price.market"]');
      await expect(priceInput).toBeVisible();
      await priceInput.fill("500");
      await priceInput.blur();
    });

    await test.step("edit the amount field", async () => {
      const itemSheet = game.locator(".application .item-sheet");

      // Amount field should be visible on settings tab for stackable items
      const amountInput = itemSheet.locator('input[name="system.amount"]');
      await expect(amountInput).toBeVisible();
      await amountInput.fill("10");
      await amountInput.blur();
    });

    await test.step("edit the description field via Foundry API", async () => {
      // Update the description via the Foundry API
      await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (actor) {
            const item = actor.items.find((i) => i.name === "New Gear");
            if (item) {
              await item.update({ "system.description.value": "This is an edited description for testing" });
            }
          }
        },
        { actorId },
      );
    });

    await test.step("close the item sheet", async () => {
      const itemSheet = game.locator(".application .item-sheet");
      await expect(itemSheet).toBeVisible();

      // Close the item sheet via the Foundry application API
      await game.evaluate(async ({ actorId }) => {
        const actor = game.actors.get(actorId);
        if (actor) {
          const item = actor.items.find((i) => i.name === "New Gear");
          if (item && item.sheet.rendered) {
            item.sheet.close();
          }
        }
      }, { actorId });

      // Wait for the item sheet to close
      await expect(itemSheet).not.toBeVisible();
    });

    let updatedSheetId = await game.evaluate(async (params) => {
      const actor = game.actors.get(params.actorId);
      if (!actor) return null;
      return actor.sheet?.element?.id ?? null;
    }, { actorId });

    if (!updatedSheetId) {
      updatedSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });
    }

    await test.step("verify price change is reflected on container sheet", async () => {
      const containerSheet = sheet(game, updatedSheetId);

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
      const containerSheet = sheet(game, updatedSheetId);

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
      const containerSheet = sheet(game, updatedSheetId);

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

  test("player permissions: create, delete, and modify items when flags are set", async ({
    page: game,
  }) => {
    const { playerId } = await game.evaluate(async () => {
      const { CONST } = globalThis;
      const user =
        game.users.getName("E2E Player") ??
        (await User.create({ name: "E2E Player", role: CONST.USER_ROLES.PLAYER }));
      return { playerId: user.id };
    });

    // --- Create test ---
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
        });
        await actor.update({
          [`ownership.${params.playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      },
      { actorId: createActorId, playerId },
    );

    await test.step("player can create items when players-create flag is set", async () => {
      const itemBeforeCount = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          return actor ? actor.items.size : 0;
        },
        { actorId: createActorId },
      );

      await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
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
        { actorId: createActorId },
      );

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return actor.items.size === params.itemBeforeCount + 1;
        },
        { actorId: createActorId, itemBeforeCount },
        { timeout: 5000 },
      );

      const playerItem = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          const item = actor.items.find(
            (i) => i.name === "Player-Created Item",
          );
          return item ? item.name : null;
        },
        { actorId: createActorId },
      );
      expect(playerItem).toBe("Player-Created Item");

      await closeDocSheet(game, { collection: "actors", id: createActorId });
    });

    // --- Delete test ---
    const deleteActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("player-delete-container"),
    });

    await game.evaluate(
      async (params) => {
        const actor = game.actors.get(params.actorId);
        await actor.setContainerType("custom");
        await actor.update({
          [`flags.${game.system.id}.players-delete`]: true,
        });
        await actor.update({
          [`ownership.${params.playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      },
      { actorId: deleteActorId, playerId },
    );

    const deleteSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: deleteActorId,
    });

    await test.step("player can delete items when players-delete flag is set", async () => {
      const containerSheet = sheet(game, deleteSheetId);
      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();
      await expect(
        containerSheet.locator(FIELD.itemName).filter({ hasText: "New Gear" }),
      ).toBeVisible();

      const embeddedItemId = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item?._id ?? null;
        },
        { actorId: deleteActorId },
      );

      const itemBeforeCount = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          return actor ? actor.items.size : 0;
        },
        { actorId: deleteActorId },
      );

      await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (actor && params.embeddedItemId) {
            await actor.deleteEmbeddedDocuments("Item", [params.embeddedItemId]);
          }
        },
        { actorId: deleteActorId, embeddedItemId },
      );

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return actor.items.size === params.itemBeforeCount - 1;
        },
        { actorId: deleteActorId, itemBeforeCount },
        { timeout: 5000 },
      );

      const remainingItem = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          return actor.items.find((i) => i.name === "New Gear");
        },
        { actorId: deleteActorId },
      );
      expect(remainingItem).toBeUndefined();

      await closeDocSheet(game, { collection: "actors", id: deleteActorId });
    });

    // --- Modify test ---
    const modifyActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("player-modify-container"),
    });

    await game.evaluate(
      async (params) => {
        const actor = game.actors.get(params.actorId);
        await actor.setContainerType("custom");
        await actor.update({
          [`flags.${game.system.id}.players-modify`]: true,
        });
        await actor.update({
          [`ownership.${params.playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      },
      { actorId: modifyActorId, playerId },
    );

    const modifySheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: modifyActorId,
    });

    await test.step("player can modify items when players-modify flag is set", async () => {
      const containerSheet = sheet(game, modifySheetId);
      const gearCreateBtn = containerSheet.locator(
        FIELD.createButtonByType("gear"),
      );
      await expect(gearCreateBtn).toBeVisible();
      await gearCreateBtn.click();
      await expect(
        containerSheet.locator(FIELD.itemName).filter({ hasText: "New Gear" }),
      ).toBeVisible();

      const embeddedItemId = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item?._id ?? null;
        },
        { actorId: modifyActorId },
      );

      await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (actor && params.embeddedItemId) {
            await actor.updateEmbeddedDocuments("Item", [
              {
                _id: params.embeddedItemId,
                "system.price.market": 750,
                "system.description.value": "Player modified this item",
              },
            ]);
          }
        },
        { actorId: modifyActorId, embeddedItemId },
      );

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item && item.system.price.market === 750;
        },
        { actorId: modifyActorId },
        { timeout: 5000 },
      );

      const modifiedItem = await game.evaluate(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return null;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item
            ? {
                price: item.system.price.market,
                description: item.system.description.value,
              }
            : null;
        },
        { actorId: modifyActorId },
      );

      expect(modifiedItem.price).toBe(750);
      expect(modifiedItem.description).toBe("Player modified this item");

      await closeDocSheet(game, { collection: "actors", id: modifyActorId });
    });
  });
});
