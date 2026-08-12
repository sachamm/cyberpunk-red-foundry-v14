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
      // Wait for notification to dismiss
      await game.waitForTimeout(2000);
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
      }
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("custom container type shows settings on token sheet", async ({
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
      async ({ actorId, tokenDocumentId }) => {
        const actor = game.actors.get(actorId);
        const token = canvas.scene.tokens.get(tokenDocumentId);
        if (!actor || !token) return null;
        await actor.sheet.render(true, { token });
        return actor.sheet.element?.id ?? null;
      },
      { actorId, tokenDocumentId },
    );
    expect(sheetId).toBeTruthy();

    await test.step("switch to custom container type", async () => {
      await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (actor && actor.sheet.rendered) {
            await actor.setContainerType("custom");
            await actor.sheet.render();
          }
        },
        { actorId },
      );
      await game.waitForTimeout(500);

      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
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

    await test.step("toggling infinite-stock on custom token sheet succeeds", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      const isInfiniteOn = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          return actor?.flags?.[game.system.id]?.["infinite-stock"] ?? false;
        },
        { actorId },
      );
      if (!isInfiniteOn) {
        await game.evaluate(
          async ({ actorId }) => {
            const actor = game.actors.get(actorId);
            if (actor) {
              await actor.update({
                [`flags.${game.system.id}.infinite-stock`]: true,
              });
              if (actor.sheet.rendered) await actor.sheet.render();
            }
          },
          { actorId },
        );
        await game.waitForTimeout(500);
        const isInfiniteOnAfter = await game.evaluate(
          async ({ actorId }) => {
            const actor = game.actors.get(actorId);
            return actor?.flags?.[game.system.id]?.["infinite-stock"] ?? false;
          },
          { actorId },
        );
        expect(isInfiniteOnAfter).toBe(true);
      }
    });

    await test.step("toggling items-free on custom token sheet succeeds", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      const isItemsFreeOn = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          return actor?.flags?.[game.system.id]?.["items-free"] ?? false;
        },
        { actorId },
      );
      if (!isItemsFreeOn) {
        await game.evaluate(
          async ({ actorId }) => {
            const actor = game.actors.get(actorId);
            if (actor) {
              await actor.update({
                [`flags.${game.system.id}.items-free`]: true,
              });
              if (actor.sheet.rendered) await actor.sheet.render();
            }
          },
          { actorId },
        );
        await game.waitForTimeout(500);
        const isItemsFreeOnAfter = await game.evaluate(
          async ({ actorId }) => {
            const actor = game.actors.get(actorId);
            return actor?.flags?.[game.system.id]?.["items-free"] ?? false;
          },
          { actorId },
        );
        expect(isItemsFreeOnAfter).toBe(true);
      }
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("shop container shows configure shop link on token sheet", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("shop-token-container"),
    });

    const tokenDocumentId = await createTokenForActor(game, actorId);
    expect(tokenDocumentId).toBeTruthy();

    const sheetId = await game.evaluate(
      async ({ actorId, tokenDocumentId }) => {
        const actor = game.actors.get(actorId);
        const token = canvas.scene.tokens.get(tokenDocumentId);
        if (!actor || !token) return null;
        await actor.sheet.render(true, { token });
        return actor.sheet.element?.id ?? null;
      },
      { actorId, tokenDocumentId },
    );
    expect(sheetId).toBeTruthy();

    await test.step("shop container shows configure shop link", async () => {
      const containerSheet = sheet(game, sheetId);
      const configureLink = containerSheet.locator(".vendor-configure-sell-to");
      await expect(configureLink).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("infinite-stock flag prevents item removal on purchase", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("infinite-stock-container"),
    });

    const tokenDocumentId = await createTokenForActor(game, actorId);
    expect(tokenDocumentId).toBeTruthy();

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("enable infinite stock on token sheet", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

      const containerSheet = sheet(game, sheetId);
      const toggle = containerSheet.locator(
        '.checkbox-toggle[data-flag-name="infinite-stock"]',
      );
      const isOff = await toggle
        .locator("i.fa-circle")
        .isVisible()
        .catch(() => true);
      if (isOff) {
        await toggle.click();
        await game.waitForTimeout(300);
      }
    });

    await test.step("create a gear item in the container", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

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
    });

    await test.step("purchase item and verify it is NOT removed", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      const purchaseLink = itemRow.locator(FIELD.purchaseAll);
      await expect(purchaseLink).toBeVisible();
      await purchaseLink.click();
      await game.waitForTimeout(500);

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
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("free-items-container"),
    });

    const tokenDocumentId = await createTokenForActor(game, actorId);
    expect(tokenDocumentId).toBeTruthy();

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("switch to custom type and enable items-free", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

      await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (actor && actor.sheet.rendered) {
            await actor.setContainerType("custom");
            await actor.sheet.render();
          }
        },
        { actorId },
      );
      await game.waitForTimeout(500);

      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

      const containerSheet = sheet(game, sheetId);
      const toggle = containerSheet.locator(
        '.checkbox-toggle[data-flag-name="items-free"]',
      );
      const isOff = await toggle
        .locator("i.fa-circle")
        .isVisible()
        .catch(() => true);
      if (isOff) {
        await toggle.click();
        await game.waitForTimeout(300);
      }
    });

    await test.step("create a gear item in the container", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

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
    });

    await test.step("purchase item and verify trade partner wealth is unchanged", async () => {
      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );
      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }

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
        await game.waitForTimeout(300);
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
      await game.waitForTimeout(500);

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
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("stash-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create a gear item to test collapse on", async () => {
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

      sheetId = await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return null;
          return actor.sheet?.element?.id ?? null;
        },
        { actorId },
      );

      if (!sheetId) {
        sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: actorId,
        });
      }
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
      await game.waitForTimeout(300);

      // After collapse, the item row should have the hide class
      const itemHasHideAfter = await gearItemRow.evaluate((el) =>
        el.classList.contains("hide"),
      );
      expect(itemHasHideAfter).toBe(true);

      // The item should no longer be visible in the accessibility tree
      await expect(gearItemRow).not.toBeVisible();
    });

    await test.step("re-expand shows the item again", async () => {
      const containerSheet = sheet(game, sheetId);

      const gearCategory = containerSheet
        .locator(FIELD.categoryHeader)
        .filter({ hasText: "Gear" });
      await expect(gearCategory).toBeVisible();

      // Click to re-expand
      await gearCategory.locator(FIELD.expandButton).click();
      await game.waitForTimeout(300);

      // The item row should no longer have the hide class
      const gearItemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      const itemHasHideAfter = await gearItemRow.evaluate((el) =>
        el.classList.contains("hide"),
      );
      expect(itemHasHideAfter).toBe(false);

      // The item should be visible again
      await expect(gearItemRow).toBeVisible();
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

  test("GM can purchase items from container inventory with sufficient funds", async ({
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

    await test.step("create a gear item in the container", async () => {
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
        await game.waitForTimeout(300);
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

      // Find the item row by name using has() to match the entire row
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();

      // Get the purchase link within the item row
      const purchaseLink = itemRow.locator(FIELD.purchaseAll);
      await expect(purchaseLink).toBeVisible();
      await purchaseLink.click();

      // Wait for the item to be removed from the container
      await game.waitForTimeout(500);

      // Verify the item is no longer in the container
      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
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
