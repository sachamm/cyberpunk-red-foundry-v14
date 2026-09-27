import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openNotesEditorViaUI,
  openOwnedItemSheet,
  reopenItemSheetViaUI,
  saveNotesEditorViaUI,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
  waitForSheetReplacement,
} from "../../../tools/playwright/ui/index.mjs";

async function createAmmoSheet(page, prefix) {
  const name = uniqueName(prefix);
  const itemId = await createItemViaUI(page, { type: "ammo", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  return { itemId, sheetId, name };
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Ammo item sheet", () => {
  test("edits ammo settings and refreshes the derived header", async ({
    page: game,
  }) => {
    const { itemId, sheetId } = await createAmmoSheet(game, "ammo-settings");
    const sheet = game.locator(`#${sheetId}`);

    await expect(
      sheet.locator('.navtabs-item [data-tab="item-description"]'),
    ).toBeVisible();
    await expect(
      sheet.locator('.navtabs-item [data-tab="item-settings"]'),
    ).toBeVisible();
    await expect(
      sheet.locator('.navtabs-item [data-tab="item-effects"]'),
    ).toHaveCount(0);

    const renamed = uniqueName("armor-piercing-rifle");
    for (const field of [
      { name: "name", path: "name", value: renamed },
      { name: "system.amount", path: "system.amount", value: 37 },
      { name: "system.brand", path: "system.brand", value: "Militech" },
      { name: "system.price.market", path: "system.price.market", value: 500 },
      {
        name: "system.ablationValue",
        path: "system.ablationValue",
        value: 2,
      },
    ]) {
      await setItemField(game, { sheetId, itemId, ...field });
    }

    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.type",
      value: "armorPiercing",
    });
    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.variety",
      value: "rifle",
    });
    await toggleItemCheckbox(game, {
      sheetId,
      itemId,
      target: "system.ignoredByBrowser",
      expected: true,
    });
    await toggleItemCheckbox(game, {
      sheetId,
      itemId,
      target: "system.concealable.concealable",
      expected: true,
    });

    await expect(sheet.locator(".item-header-name-text")).toHaveText(renamed);
    await expect(sheet.locator(".item-header-breadcrumb")).toContainText(
      "Armor-Piercing",
    );
    await expect(sheet.locator(".item-header-breadcrumb")).toContainText(
      "Rifle Ammo",
    );
    await expect(sheet.locator(".item-header-price")).toContainText("500");
    await expect(sheet.locator(".item-header-price-category")).toHaveText(
      "(Expensive)",
    );
    await expect(sheet.locator(".item-header-chips")).toContainText(
      "Ablation 2",
    );

    await closeDocSheet(game, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(game, itemId);
    const reopened = await openItemSettings(game, reopenedId);
    await expect(reopened.locator('input[name="name"]')).toHaveValue(renamed);
    await expect(reopened.locator('input[name="system.amount"]')).toHaveValue(
      "37",
    );
    await expect(reopened.locator('input[name="system.brand"]')).toHaveValue(
      "Militech",
    );
    await expect(
      reopened.locator('input[name="system.price.market"]'),
    ).toHaveValue("500");
    await expect(reopened.locator(".item-header-price-category")).toHaveText(
      "(Expensive)",
    );
    await expect(reopened.locator('select[name="system.type"]')).toHaveValue(
      "armorPiercing",
    );
    await expect(reopened.locator('select[name="system.variety"]')).toHaveValue(
      "rifle",
    );
    await closeDocSheet(game, { collection: "items", id: itemId });
  });

  test("reveals and persists damage, autofire, and critical overrides", async ({
    page: game,
  }) => {
    const { itemId, sheetId } = await createAmmoSheet(game, "ammo-overrides");
    let sheet = await openItemSettings(game, sheetId);

    await expect(
      sheet.locator('input[name="system.overrides.damage.value"]'),
    ).toHaveCount(0);
    await expect(
      sheet.locator('input[name="system.overrides.autofire.value"]'),
    ).toHaveCount(0);
    await expect(
      sheet.locator('input[name="system.overrides.crit.threshold"]'),
    ).toHaveCount(0);

    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.overrides.damage.mode",
      value: "modify",
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.overrides.damage.value",
      path: "system.overrides.damage.value",
      value: "2d6+1",
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.overrides.damage.minimum",
      path: "system.overrides.damage.minimum",
      value: "1d6",
    });

    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.overrides.autofire.mode",
      value: "modify",
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.overrides.autofire.value",
      path: "system.overrides.autofire.value",
      value: 2,
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.overrides.autofire.minimum",
      path: "system.overrides.autofire.minimum",
      value: 1,
    });

    await toggleItemCheckbox(game, {
      sheetId,
      itemId,
      target: "system.overrides.crit.override",
      expected: true,
    });
    for (const [field, value] of [
      ["threshold", 5],
      ["count", 2],
      ["bonus", 7],
    ]) {
      await setItemField(game, {
        sheetId,
        itemId,
        name: `system.overrides.crit.${field}`,
        path: `system.overrides.crit.${field}`,
        value,
      });
    }

    await expect(sheet.locator(".item-header-chips")).toContainText(
      "Damage 2d6+1",
    );

    await closeDocSheet(game, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(game, itemId);
    sheet = await openItemSettings(game, reopenedId);
    await expect(
      sheet.locator('input[name="system.overrides.damage.value"]'),
    ).toHaveValue("2d6+1");
    await expect(
      sheet.locator('input[name="system.overrides.damage.minimum"]'),
    ).toHaveValue("1d6");
    await expect(
      sheet.locator('input[name="system.overrides.autofire.value"]'),
    ).toHaveValue("2");
    await expect(
      sheet.locator('input[name="system.overrides.crit.threshold"]'),
    ).toHaveValue("5");
    await expect(
      sheet.locator('input[name="system.overrides.crit.count"]'),
    ).toHaveValue("2");
    await expect(
      sheet.locator('input[name="system.overrides.crit.bonus"]'),
    ).toHaveValue("7");
    await closeDocSheet(game, { collection: "items", id: itemId });
  });

  test("only exposes concealed state on owned concealable ammo and clears it when disabled", async ({
    page: game,
  }) => {
    const actorId = await createActorViaUI(game, {
      type: "character",
      name: uniqueName("ammo-owner"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
    const {
      itemId: worldItemId,
      sheetId: worldSheetId,
      name,
    } = await createAmmoSheet(game, "concealable-ammo");

    await toggleItemCheckbox(game, {
      sheetId: worldSheetId,
      itemId: worldItemId,
      target: "system.concealable.concealable",
      expected: true,
    });
    await expect(
      (await openItemSettings(game, worldSheetId)).locator(
        'a.item-checkbox[data-target="system.concealable.isConcealed"]',
      ),
    ).toHaveCount(0);
    await closeDocSheet(game, { collection: "items", id: worldItemId });

    await dragItemToActorSheet(game, {
      itemId: worldItemId,
      sheetId: actorSheetId,
      actorId,
    });
    const ownedItemId = await game.evaluate(
      ({ actorId, name }) =>
        game.actors.get(actorId).items.find((item) => item.name === name).id,
      { actorId, name },
    );
    const actorSheet = game.locator(`#${actorSheetId}`);
    await actorSheet.locator('.navtabs-right a[data-tab="gear"]').click();
    const ownedRow = actorSheet.locator(
      `li.item[data-item-id="${ownedItemId}"]`,
    );
    await expect(ownedRow).toBeVisible();
    await ownedRow.locator(".item-edit").click();
    const ownedSheetId = await openOwnedItemSheet(game, {
      actorId,
      itemId: ownedItemId,
    });
    let ownedSheet = await openItemSettings(game, ownedSheetId);
    await expect(
      ownedSheet.locator(
        'a.item-checkbox[data-target="system.concealable.isConcealed"]',
      ),
    ).toBeVisible();

    await toggleItemCheckbox(game, {
      sheetId: ownedSheetId,
      actorId,
      itemId: ownedItemId,
      target: "system.concealable.isConcealed",
      expected: true,
    });
    await toggleItemCheckbox(game, {
      sheetId: ownedSheetId,
      actorId,
      itemId: ownedItemId,
      target: "system.concealable.concealable",
      expected: false,
    });
    await expect
      .poll(() =>
        game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.concealable
              .isConcealed,
          { actorId, itemId: ownedItemId },
        ),
      )
      .toBe(false);
    ownedSheet = await openItemSettings(game, ownedSheetId);
    await expect(
      ownedSheet.locator(
        'a.item-checkbox[data-target="system.concealable.isConcealed"]',
      ),
    ).toHaveCount(0);

    await closeOwnedItemSheet(game, { actorId, itemId: ownedItemId });
    await ownedRow.locator(".item-edit").click();
    const reopenedId = await openOwnedItemSheet(game, {
      actorId,
      itemId: ownedItemId,
    });
    const reopened = await openItemSettings(game, reopenedId);
    await expect(
      reopened.locator(
        'a.item-checkbox[data-target="system.concealable.isConcealed"]',
      ),
    ).toHaveCount(0);
    await closeOwnedItemSheet(game, { actorId, itemId: ownedItemId });
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("saves the description through the rich-text editor and survives reopening", async ({
    page: game,
  }) => {
    const { itemId, sheetId } = await createAmmoSheet(game, "ammo-description");
    const sheet = game.locator(`#${sheetId}`);
    const description = uniqueName("Ammo description");
    const editor = await openNotesEditorViaUI(
      sheet,
      "system.description.value",
    );
    await editor
      .locator('.editor-content[contenteditable="true"]')
      .fill(description);
    const priorPart = await sheet
      .locator('[data-application-part="form"]')
      .elementHandle();
    await saveNotesEditorViaUI(editor);
    await waitForSheetReplacement(game, priorPart);

    await closeDocSheet(game, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(game, itemId);
    await expect(
      game
        .locator(`#${reopenedId}`)
        .locator(
          'prose-mirror[name="system.description.value"] .editor-content',
        ),
    ).toContainText(description);
    await closeDocSheet(game, { collection: "items", id: itemId });
  });
});
