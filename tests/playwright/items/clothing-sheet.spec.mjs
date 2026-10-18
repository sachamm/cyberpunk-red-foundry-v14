import { test, expect } from "@playwright/test";
import {
  gotoReadyWorld,
  openPlayerPage,
} from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeActiveEffectConfigViaUI,
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createEmbeddedItemViaUI,
  createEffectViaUI,
  createItemViaUI,
  expectSheetRendered,
  hoverGearRow,
  openItemSettings,
  openNotesEditorViaUI,
  openOwnedItemSheet,
  reopenItemSheetViaUI,
  saveNotesEditorViaUI,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

test.beforeEach(async ({ page }) => gotoReadyWorld(page));

test("Clothing sheet settings, description, installation and effects persist", async ({
  page,
}) => {
  const name = uniqueName("clothing");
  const itemId = await createItemViaUI(page, { type: "clothing", name });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const reopen = async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    return openItemSettings(page, sheetId);
  };

  await test.step("new clothing shows its tabs and world-only controls", async () => {
    const sheet = await openItemSettings(page, sheetId);
    for (const tab of ["description", "settings", "effects"]) {
      await expect
        .soft(sheet.locator(`.navtabs-item [data-tab="item-${tab}"]`))
        .toBeVisible();
    }
    await expect.soft(sheet.locator(".item-header-name-text")).toHaveText(name);
    await expect
      .soft(sheet.locator(".item-header-breadcrumb"))
      .toContainText("Jacket");
    await expect
      .soft(sheet.locator('select[name="system.equipped"]'))
      .toHaveCount(0);
    await expect
      .soft(sheet.locator('[data-target="system.concealable.isConcealed"]'))
      .toHaveCount(0);
  });

  await test.step("style and subtype update the breadcrumb after reopening", async () => {
    for (const [field, value] of [
      ["style", "urbanFlash"],
      ["type", "mirrorshades"],
    ]) {
      await setItemSelected(page, {
        sheetId,
        itemId,
        name: `system.${field}`,
        value,
      });
    }
    const sheet = await reopen();
    await expect
      .soft(sheet.locator('select[name="system.style"]'))
      .toHaveValue("urbanFlash");
    await expect
      .soft(sheet.locator('select[name="system.type"]'))
      .toHaveValue("mirrorshades");
    await expect
      .soft(sheet.locator(".item-header-breadcrumb"))
      .toContainText("Urban Flash");
    await expect
      .soft(sheet.locator(".item-header-breadcrumb"))
      .toContainText("Mirrorshades");
  });

  await test.step("shared fields, toggles and source citations survive a fresh render", async () => {
    const sheet = await openItemSettings(page, sheetId);
    await sheet.locator('a.source-action[data-action-type="create"]').click();
    const fields = [
      ["name", `${name}-edited`],
      ["system.brand", "Kiroshi"],
      ["system.amount", 2],
      ["system.price.market", 500],
      ["system.sources.0.book", "Edgerunners"],
      ["system.sources.0.page", 42],
    ];
    for (const [field, value] of fields) {
      await setItemField(page, {
        sheetId,
        itemId,
        name: field,
        path: field,
        value,
      });
    }
    for (const target of [
      "system.ignoredByBrowser",
      "system.concealable.concealable",
      "system.isElectronic",
      "system.providesHardening",
    ]) {
      await toggleItemCheckbox(page, {
        sheetId,
        itemId,
        target,
        expected: true,
      });
    }
    const fresh = await reopen();
    for (const [field, value] of fields) {
      await expect
        .soft(fresh.locator(`input[name="${field}"]`))
        .toHaveValue(String(value));
    }
    for (const target of [
      "system.ignoredByBrowser",
      "system.concealable.concealable",
      "system.isElectronic",
      "system.providesHardening",
    ]) {
      await expect
        .soft(fresh.locator(`[data-target="${target}"] i`))
        .toHaveClass(/check/);
    }
    await expect
      .soft(fresh.locator(".item-header-sources"))
      .toContainText("Edgerunners pg. 42");
    await expect
      .soft(fresh.locator(".item-header-price-category"))
      .toHaveText("(Expensive)");
    await expect
      .soft(fresh.locator(".item-header-chips"))
      .toContainText("Concealable");
  });

  await test.step("description edits save and remain visible on reopening", async () => {
    const sheet = page.locator(`#${sheetId}`);
    await sheet.locator('[data-tab="item-description"].tab-label').click();
    const editor = await openNotesEditorViaUI(
      sheet,
      "system.description.value",
    );
    await editor
      .locator('.editor-content[contenteditable="true"]')
      .fill("Reflective lenses with a concealed camera.");
    await saveNotesEditorViaUI(editor);
    await expect
      .soft(editor)
      .toContainText("Reflective lenses with a concealed camera.");
    await reopen();
    await page
      .locator(`#${sheetId} [data-tab="item-description"].tab-label`)
      .click();
    await expect
      .soft(page.locator(`#${sheetId} prose-mirror`))
      .toContainText("Reflective lenses with a concealed camera.");
  });

  await test.step("source removal confirms and clears the header citation", async () => {
    const sheet = await openItemSettings(page, sheetId);
    await sheet.locator('a.source-action[data-action-type="delete"]').click();
    await page.locator('.application.dialog button[data-action="yes"]').click();
    await page.waitForFunction(
      (id) => game.items.get(id).system.sources.length === 0,
      itemId,
    );
    const fresh = await reopen();
    await expect.soft(fresh.locator('input[name$=".book"]')).toHaveCount(0);
    await expect
      .soft(fresh.locator(".item-header-sources"))
      .not.toContainText("Edgerunners");
  });

  await test.step("installable types and slots persist through the container dialog", async () => {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.installedItems.allowed",
      expected: false,
    });
    await expect
      .soft((await reopen()).locator("a.manage-installable-types"))
      .toHaveCount(0);
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.installedItems.allowed",
      expected: true,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.installedItems.slots",
      path: "system.installedItems.slots",
      value: 2,
    });
    await page.locator(`#${sheetId} a.manage-installable-types`).click();
    const dialog = page
      .locator(".application.dialog")
      .filter({ has: page.locator('input[name="selectedTypes"]') });
    await dialog
      .locator('input[name="selectedTypes"][value="cyberdeck"]')
      .check();
    await dialog
      .locator('input[name="selectedTypes"][value="itemUpgrade"]')
      .check();
    await dialog.locator('button[data-action="confirm"]').click();
    const sheet = await reopen();
    await expect
      .soft(sheet.locator('input[name="system.installedItems.slots"]'))
      .toHaveValue("2");
    await expect
      .soft(
        sheet
          .locator("li")
          .filter({ has: page.locator(".manage-installable-types") }),
      )
      .toContainText("Cyberdeck");
    await sheet.locator("a.manage-installed-upgrades").click();
    await expect(page.locator(".application.dialog")).toBeVisible();
    await page
      .locator('.application.dialog button[data-action="cancel"]')
      .click();
  });

  for (const type of ["cyberdeck", "itemUpgrade"]) {
    await test.step(`installing and removing ${type} locks and restores the allowed-items control`, async () => {
      const childName = uniqueName("clothing-camera");
      const childId = await createItemViaUI(page, {
        type,
        name: childName,
      });
      if (type === "itemUpgrade") {
        const childSheetId = await expectSheetRendered(page, {
          collection: "items",
          id: childId,
        });
        await setItemSelected(page, {
          sheetId: childSheetId,
          itemId: childId,
          name: "system.type",
          value: "clothing",
        });
      }
      await closeDocSheet(page, { collection: "items", id: childId });
      await reopen();
      const manage = async (selected) => {
        const selector =
          type === "cyberdeck"
            ? "a.manage-installed-items"
            : "a.manage-installed-upgrades";
        await page.locator(`#${sheetId} ${selector}`).click();
        const dialog = page
          .locator(".application.dialog")
          .filter({ has: page.locator('input[name="selectedItems"]') });
        const targetId = selected
          ? childId
          : await page.evaluate(
              (id) => game.items.get(id).system.installedItems.list[0],
              itemId,
            );
        await dialog
          .locator(`input[name="selectedItems"][value="${targetId}"]`)
          .setChecked(selected);
        await dialog.locator('button[data-action="confirm"]').click();
        await page.waitForFunction(
          ({ itemId, selected }) =>
            game.items.get(itemId).system.installedItems.list.length ===
            (selected ? 1 : 0),
          { itemId, selected },
        );
        return reopen();
      };
      const installed = await manage(true);
      await expect.soft(installed).toContainText(childName);
      await expect
        .soft(
          installed.locator('[data-target="system.installedItems.allowed"]'),
        )
        .toHaveCount(0);
      const removed = await manage(false);
      await expect
        .soft(removed.locator('[data-target="system.installedItems.allowed"]'))
        .toBeVisible();
      await expect
        .soft(removed.locator(".item-view").filter({ hasText: childName }))
        .toHaveCount(0);
    });
  }

  await test.step("effect creation, copying, usage and deletion use the Clothing sheet", async () => {
    let sheet = page.locator(`#${sheetId}`);
    await sheet.locator('[data-tab="item-effects"].tab-label').click();
    const { aeConfig, effectId } = await createEffectViaUI(page, sheet, {
      ownerType: "item",
      ownerId: itemId,
    });
    await closeActiveEffectConfigViaUI(page, aeConfig);
    await reopen();
    sheet = page.locator(`#${sheetId}`);
    await sheet.locator('[data-tab="item-effects"].tab-label').click();
    await expect
      .soft(
        sheet.locator(`a[data-action="edit"][data-effect-id="${effectId}"]`),
      )
      .toBeVisible();
    await sheet
      .locator(`a[data-action="copy"][data-effect-id="${effectId}"]`)
      .click();
    await expect.soft(sheet.locator("li.effect")).toHaveCount(2);
    await reopen();
    await sheet.locator('[data-tab="item-effects"].tab-label').click();
    await expect.soft(sheet.locator("li.effect")).toHaveCount(2);
    await sheet.locator('select[name="system.usage"]').selectOption("equipped");
    await page.waitForFunction(
      (id) => game.items.get(id).system.usage === "equipped",
      itemId,
    );
    await reopen();
    await sheet.locator('[data-tab="item-effects"].tab-label').click();
    await expect
      .soft(sheet.locator('select[name="system.usage"]'))
      .toHaveValue("equipped");
    await expect.soft(sheet.locator('a[data-action="toggle"]')).toHaveCount(0);
    await sheet.locator('a[data-action="delete"]').first().click();
    await reopen();
    await sheet.locator('[data-tab="item-effects"].tab-label').click();
    await expect.soft(sheet.locator("li.effect")).toHaveCount(1);
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
});

test("owned Clothing exposes equipment and clears concealed state when no longer concealable", async ({
  page,
}) => {
  const inventoryCreation = await page.evaluate(() =>
    game.settings.get(game.system.id, "playersCreateInventory"),
  );
  await page.evaluate(() =>
    game.settings.set(game.system.id, "playersCreateInventory", true),
  );
  try {
    const actorId = await createActorViaUI(page, {
      type: "character",
      name: uniqueName("clothing-owner"),
    });
    const actorSheetId = await expectSheetRendered(page, {
      collection: "actors",
      id: actorId,
    });
    await activateGearTab(page, actorSheetId);
    const itemId = await createEmbeddedItemViaUI(page, {
      sheetId: actorSheetId,
      actorId,
      type: "clothing",
    });
    let sheetId;
    const reopen = async () => {
      if (sheetId) await closeOwnedItemSheet(page, { actorId, itemId });
      const gear = await activateGearTab(page, actorSheetId);
      const row = await hoverGearRow(gear, itemId);
      await row.locator(".item-edit").click();
      sheetId = await openOwnedItemSheet(page, { actorId, itemId });
      return openItemSettings(page, sheetId);
    };
    await reopen();

    await test.step("equipment selection survives reopening", async () => {
      const select = page.locator(`#${sheetId} select[name="system.equipped"]`);
      await select.selectOption("carried");
      await page.waitForFunction(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId).system.equipped ===
          "carried",
        { actorId, itemId },
      );
      const sheet = await reopen();
      await expect
        .soft(sheet.locator('select[name="system.equipped"]'))
        .toHaveValue("carried");
    });
    for (const [target, expected] of [
      ["system.concealable.concealable", true],
      ["system.concealable.isConcealed", true],
      ["system.concealable.concealable", false],
      ["system.concealable.concealable", true],
    ]) {
      await test.step(`${target} becomes ${expected} on a fresh render`, async () => {
        await toggleItemCheckbox(page, {
          sheetId,
          actorId,
          itemId,
          target,
          expected,
        });
        const sheet = await reopen();
        await expect
          .soft(sheet.locator(`[data-target="${target}"] i`))
          .toHaveClass(expected ? /check/ : /fa-circle$/);
        const concealed = sheet.locator(
          '[data-target="system.concealable.isConcealed"]',
        );
        if (target.endsWith("concealable")) {
          if (expected)
            await expect.soft(concealed.locator("i")).toHaveClass(/fa-circle$/);
          else await expect.soft(concealed).toHaveCount(0);
        }
      });
    }
    await closeOwnedItemSheet(page, { actorId, itemId });
    await closeDocSheet(page, { collection: "actors", id: actorId });
  } finally {
    await page.evaluate(
      (enabled) =>
        game.settings.set(game.system.id, "playersCreateInventory", enabled),
      inventoryCreation,
    );
  }
});

test("an Observer can read Clothing but cannot edit its settings or effects", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = uniqueName("observed-clothing");
  const itemId = await createItemViaUI(page, { type: "clothing", name });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await page.evaluate(async (id) => {
    const item = game.items.get(id);
    await item.update({
      "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    });
  }, itemId);
  const player = await openPlayerPage(browser, baseURL);
  try {
    const sheetId = await reopenItemSheetViaUI(player.page, itemId);
    const sheet = await openItemSettings(player.page, sheetId);
    await expect.soft(sheet.locator(".item-header-name-text")).toHaveText(name);
    await expect
      .soft(
        sheet.locator(
          'input[name="name"], input[name="system.brand"], a.source-action, a.manage-installed-items',
        ),
      )
      .toHaveCount(0);
    for (const field of ["style", "type"])
      await expect
        .soft(sheet.locator(`select[name="system.${field}"]`))
        .toBeDisabled();
    await sheet.locator('[data-tab="item-effects"].tab-label').click();
    await expect.soft(sheet.locator("a.effect-control")).toHaveCount(0);
    await sheet.locator('[data-tab="item-description"].tab-label').click();
    await sheet.locator("prose-mirror").hover();
    await expect
      .soft(sheet.locator("prose-mirror button.toggle"))
      .toBeDisabled();
    await expect.soft(sheet.locator("prose-mirror button.toggle")).toBeHidden();
  } finally {
    await player.context.close();
  }
});
