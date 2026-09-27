import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createItemViaUI,
  expectSheetRendered,
  openItemSettings,
  reopenItemSheetViaUI,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

async function createWeaponSheet(page, prefix) {
  const name = uniqueName(prefix);
  const itemId = await createItemViaUI(page, { type: "weapon", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  return { itemId, sheetId, name };
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Weapon item sheet", () => {
  test("edits quality, attack, armor, and upgrade-slot settings", async ({
    page: game,
  }) => {
    const { itemId, sheetId } = await createWeaponSheet(
      game,
      "weapon-settings",
    );
    const sheet = game.locator(`#${sheetId}`);

    for (const tab of ["item-description", "item-settings", "item-effects"]) {
      await expect(
        sheet.locator(`.navtabs-item [data-tab="${tab}"]`),
      ).toBeVisible();
    }

    const renamed = uniqueName("poor-heavy-pistol");
    for (const field of [
      { name: "name", path: "name", value: renamed },
      { name: "system.brand", path: "system.brand", value: "Budget Arms" },
      { name: "system.price.market", path: "system.price.market", value: 100 },
      { name: "system.rof", path: "system.rof", value: 2 },
      { name: "system.attackmod", path: "system.attackmod", value: 3 },
      { name: "system.handsReq", path: "system.handsReq", value: 2 },
      { name: "system.damage", path: "system.damage", value: "3d6" },
      {
        name: "system.damageCrit.threshold",
        path: "system.damageCrit.threshold",
        value: 5,
      },
      {
        name: "system.damageCrit.count",
        path: "system.damageCrit.count",
        value: 3,
      },
      {
        name: "system.damageCrit.bonus",
        path: "system.damageCrit.bonus",
        value: 8,
      },
      {
        name: "system.installedItems.slots",
        path: "system.installedItems.slots",
        value: 2,
      },
    ]) {
      await setItemField(game, { sheetId, itemId, ...field });
    }

    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.quality",
      value: "poor",
    });
    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.critFailEffect",
      value: "destroyed",
    });
    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.weaponType",
      value: "heavyPistol",
    });
    await toggleItemCheckbox(game, {
      sheetId,
      itemId,
      target: "system.canIgnoreArmor",
      expected: true,
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.ignoreArmorPercent",
      path: "system.ignoreArmorPercent",
      value: 50,
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.ignoreBelowSP",
      path: "system.ignoreBelowSP",
      value: 11,
    });

    await expect(sheet.locator(".item-header-name-text")).toHaveText(renamed);
    await expect(sheet.locator(".item-header-breadcrumb")).toContainText(
      "Poor",
    );
    await expect(sheet.locator(".item-header-breadcrumb")).toContainText(
      "Heavy Pistol",
    );
    await expect(sheet.locator(".item-header-breadcrumb")).toContainText(
      "Budget Arms",
    );
    await expect(sheet.locator(".item-header-chips")).toContainText(
      "Damage 3d6",
    );
    await expect(sheet.locator(".item-header-chips")).toContainText("ROF 2");

    await closeDocSheet(game, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(game, itemId);
    const reopened = await openItemSettings(game, reopenedId);
    await expect(reopened.locator('select[name="system.quality"]')).toHaveValue(
      "poor",
    );
    await expect(
      reopened.locator('select[name="system.critFailEffect"]'),
    ).toHaveValue("destroyed");
    await expect(
      reopened.locator('input[name="system.ignoreArmorPercent"]'),
    ).toHaveValue("50");
    await expect(
      reopened.locator('input[name="system.ignoreBelowSP"]'),
    ).toHaveValue("11");
    await expect(
      reopened.locator('input[name="system.installedItems.slots"]'),
    ).toHaveValue("2");
    await closeDocSheet(game, { collection: "items", id: itemId });
  });

  test("reveals ranged controls and persists compatible ammunition", async ({
    page: game,
  }) => {
    const { itemId, sheetId } = await createWeaponSheet(game, "ranged-weapon");
    let sheet = await openItemSettings(game, sheetId);

    await expect(sheet.locator('select[name="system.dvTable"]')).toHaveCount(0);
    await expect(
      sheet.locator('input[name="system.magazine.max"]'),
    ).toHaveCount(0);

    await toggleItemCheckbox(game, {
      sheetId,
      itemId,
      target: "system.isRanged",
      expected: true,
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.fireModes.autoFire",
      path: "system.fireModes.autoFire",
      value: 3,
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.magazine.max",
      path: "system.magazine.max",
      value: 30,
    });
    await toggleItemCheckbox(game, {
      sheetId,
      itemId,
      target: "system.fireModes.suppressiveFire",
      expected: true,
    });

    sheet = await openItemSettings(game, sheetId);
    await expect(sheet.locator('select[name="system.dvTable"]')).toBeVisible();
    await sheet.locator(".select-compatible-ammo").click();
    const dialog = game
      .locator(".application")
      .filter({ has: game.locator('input[name="selectedAmmo"]') });
    await expect(dialog).toBeVisible();
    await dialog
      .locator('input[name="selectedAmmo"][value="heavyPistol"]')
      .check();
    await dialog.locator('input[name="selectedAmmo"][value="rifle"]').check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await game.waitForFunction(
      (id) => {
        const varieties = game.items.get(id).system.ammoVariety;
        return varieties.includes("heavyPistol") && varieties.includes("rifle");
      },
      itemId,
      { timeout: 10000 },
    );

    await expect(sheet.locator(".compatible-ammo")).toContainText(
      "Heavy Pistol Ammo",
    );
    await expect(sheet.locator(".compatible-ammo")).toContainText("Rifle Ammo");
    await expect(sheet.locator(".item-header-chips")).toContainText(
      "Autofire (3)",
    );
    await expect(sheet.locator(".item-header-chips")).toContainText(
      "Suppressive Fire",
    );

    await closeDocSheet(game, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(game, itemId);
    const reopened = await openItemSettings(game, reopenedId);
    await expect(
      reopened.locator('input[name="system.fireModes.autoFire"]'),
    ).toHaveValue("3");
    await expect(
      reopened.locator('input[name="system.magazine.max"]'),
    ).toHaveValue("30");
    await expect(reopened.locator(".compatible-ammo")).toContainText(
      "Heavy Pistol Ammo",
    );
    await expect(reopened.locator(".compatible-ammo")).toContainText(
      "Rifle Ammo",
    );
    await closeDocSheet(game, { collection: "items", id: itemId });
  });

  test("switches between automatic and manual unarmed damage", async ({
    page: game,
  }) => {
    const { itemId, sheetId } = await createWeaponSheet(game, "unarmed-weapon");
    await setItemSelected(game, {
      sheetId,
      itemId,
      name: "system.weaponType",
      value: "unarmed",
    });

    let sheet = await openItemSettings(game, sheetId);
    await expect(sheet.locator('input[name="system.damage"]')).toHaveCount(0);
    await expect(sheet).toContainText("Auto-calculated based on BODY");

    await toggleItemCheckbox(game, {
      sheetId,
      itemId,
      target: "system.unarmedAutomaticCalculation",
      expected: false,
    });
    await setItemField(game, {
      sheetId,
      itemId,
      name: "system.damage",
      path: "system.damage",
      value: "2d6",
    });

    await closeDocSheet(game, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(game, itemId);
    sheet = await openItemSettings(game, reopenedId);
    await expect(sheet.locator('input[name="system.damage"]')).toHaveValue(
      "2d6",
    );
    await closeDocSheet(game, { collection: "items", id: itemId });
  });
});
