import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  createDocumentViaUI,
  createInventoryItemViaUI,
  dragItemToActorSheet,
  enablePlayersCreateInventory,
  expectSheetRendered,
  installUpgrade,
  openItemSettings,
  openOwnedItemSheet,
  setItemField,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createCharacterViaUI,
  gearRow,
  selectAmmoDialog,
} from "../actors/character-sheet-helpers.mjs";

/*
 * Upgradable mixin: how several installed upgrades on the same data point
 * aggregate. `getTotalUpgradeValues` sums modifiers onto the base value, but
 * a single largest override beats that sum (an override of 0 falls back to
 * the modifier result). This spec pins the rule through two clean surfaces:
 * the magazine chip on the weapon sheet's Settings tab (`cprShowUpgrade`)
 * and the capacity the reload flow actually fills to.
 */

// Create a weapon-type itemUpgrade whose magazine data point is configured
// as `modType` (modifier|override) with `value`, driven through the upgrade
// sheet's own fields.
async function createMagazineUpgrade(page, { upgradeName, modType, value }) {
  const upgradeId = await createDocumentViaUI(page, {
    documentTab: "items",
    type: "itemUpgrade",
    name: upgradeName,
  });
  const upgradeSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: upgradeId,
  });
  // itemUpgrade.system.type defaults to "weapon"; confirm before proceeding.
  expect(
    await page.evaluate((id) => game.items.get(id).system.type, upgradeId),
  ).toBe("weapon");
  await setItemSelected(page, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: "system.modifiers.magazine.type",
    value: modType,
  });
  await setItemField(page, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: "system.modifiers.magazine.value",
    path: "system.modifiers.magazine.value",
    value,
  });
  await closeDocSheet(page, { collection: "items", id: upgradeId });
  return upgradeId;
}

// Open the owned weapon's Settings tab from its gear row. The gear tab must
// already be active on the actor sheet.
async function openWeaponSettings(page, { actorId, itemId, sheetId }) {
  const row = gearRow(page, sheetId, itemId);
  await expect(row.locator(".item-edit")).toBeVisible();
  await row.locator(".item-edit").click();
  const itemSheetId = await openOwnedItemSheet(page, { actorId, itemId });
  return openItemSettings(page, itemSheetId);
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Item upgradable mixin", () => {
  test("the largest magazine override beats the modifier sum for capacity", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // A weapon with base capacity 6 that accepts rifle ammo and upgrades.
    const weaponName = uniqueName("smg");
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponName,
      data: {
        system: {
          isRanged: true,
          ammoVariety: ["rifle"],
          magazine: { max: 6 },
          installedItems: { allowedTypes: ["itemUpgrade", "ammo"] },
        },
      },
    });
    // An ammo stack with a known amount so the reload draw is checkable.
    const ammo = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weapon.sheetId,
      itemType: "ammo",
      itemName: uniqueName("rifleAmmo"),
      data: { system: { variety: "rifle", amount: 12 } },
    });

    // Two upgrades on the same data point: an override to 9 and a +2 modifier.
    const overrideName = uniqueName("extendedMag");
    const modifierName = uniqueName("capacityCells");
    const overrideId = await createMagazineUpgrade(page, {
      upgradeName: overrideName,
      modType: "override",
      value: 9,
    });
    const modifierId = await createMagazineUpgrade(page, {
      upgradeName: modifierName,
      modType: "modifier",
      value: 2,
    });

    // The latest actor-sheet element id after the creations above.
    const freshSheet = ammo.sheetId;
    for (const itemId of [overrideId, modifierId]) {
      await dragItemToActorSheet(page, {
        itemId,
        sheetId: freshSheet,
        actorId,
      });
    }
    const embeddedUpgradeIds = await page.evaluate(
      ({ actorId, names }) =>
        Object.fromEntries(
          names.map((name) => [
            name,
            game.actors.get(actorId).items.find((i) => i.name === name)?.id,
          ]),
        ),
      { actorId, names: [overrideName, modifierName] },
    );

    await test.step("the base weapon shows capacity 6 with no upgrade chip", async () => {
      const settings = await openWeaponSettings(page, {
        actorId,
        itemId: weapon.itemId,
        sheetId: freshSheet,
      });
      // `has` locators are re-anchored inside each candidate row, so pass a
      // page-relative locator (the repo idiom), not one scoped to the sheet.
      const magazineRow = settings.locator("li.item", {
        has: page.locator('input[name="system.magazine.max"]'),
      });
      await expect(
        magazineRow.locator('input[name="system.magazine.max"]'),
      ).toHaveValue("6");
      await expect(magazineRow).not.toContainText("(");
      await closeOwnedItemSheet(page, { actorId, itemId: weapon.itemId });
    });

    await test.step("installing both upgrades shows the override value in the chip", async () => {
      await installUpgrade(page, {
        actorSheetId: freshSheet,
        actorId,
        upgradeId: embeddedUpgradeIds[overrideName],
        targetId: weapon.itemId,
      });
      await installUpgrade(page, {
        actorSheetId: freshSheet,
        actorId,
        upgradeId: embeddedUpgradeIds[modifierName],
        targetId: weapon.itemId,
      });

      const settings = await openWeaponSettings(page, {
        actorId,
        itemId: weapon.itemId,
        sheetId: freshSheet,
      });
      const magazineRow = settings.locator("li.item", {
        has: page.locator('input[name="system.magazine.max"]'),
      });
      // The chip renders getTotalUpgradeValues("magazine"): the override 9
      // wins outright — not 8 (base + modifier) and not 11 (override +
      // modifier added together).
      await expect(magazineRow).toContainText("(Attachments override: 9)");
      await expect(magazineRow).not.toContainText("11");
      await closeOwnedItemSheet(page, { actorId, itemId: weapon.itemId });
    });

    await test.step("reloading fills to the override capacity and draws from the stack", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator('a.item-action[data-action="select-ammo"]').click();
      const dialog = selectAmmoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await dialog
        .locator('select[name="selectedAmmo"]')
        .selectOption({ value: ammo.itemId });
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      // Reload fills to the upgraded capacity (9), drawing 9 of the stack's 12.
      await page.waitForFunction(
        ({ aid, wid, ammoId }) =>
          game.actors.get(aid).items.get(wid).system.magazine.value === 9 &&
          game.actors.get(aid).items.get(ammoId).system.amount === 3,
        { aid: actorId, wid: weapon.itemId, ammoId: ammo.itemId },
        { timeout: 10000 },
      );

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        gearRow(page, afterSheet, weapon.itemId).locator(".gear-amount"),
      ).toHaveText("9/9");
    });
  });
});
