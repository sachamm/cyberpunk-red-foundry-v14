import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  createDocumentViaUI,
  createInventoryItemViaUI,
  dismissNotifications,
  dragItemToActorSheet,
  enablePlayersCreateInventory,
  equipWeapon,
  expectModEntry,
  expectSheetRendered,
  installUpgrade,
  openOwnedItemSettings,
  openSidebarTab,
  readDamageFormula,
  readTotalModsTooltip,
  setItemField,
  setItemSelected,
  uniqueName,
  verifyRollDialog,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";
import {
  chatRollCard,
  createCharacterViaUI,
  gearRow,
  rollDiceSum,
  selectAmmoDialog,
} from "../actors/character-sheet-helpers.mjs";

/*
 * Upgradable mixin: how installed upgrades change a weapon. On the magazine
 * data point, `getTotalUpgradeValues` sums modifiers onto the base value, but
 * a single largest override beats that sum (an override of 0 falls back to
 * the modifier result). On the damage data point, a modifier-type upgrade
 * rides the damage roll as a mod: the formula stays put and the posted total
 * gains the bonus. This spec pins both through clean surfaces: the magazine
 * chip on the weapon sheet's Settings tab (`cprShowUpgrade`), the capacity
 * the reload flow actually fills to, and the total a posted damage card shows.
 */

// Create a weapon-type itemUpgrade whose `dataPoint` (e.g. "magazine" or
// "damage") is configured as `modType` (modifier|override) with `value`,
// driven through the upgrade sheet's own fields.
async function createWeaponUpgrade(
  page,
  { upgradeName, dataPoint, modType, value },
) {
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
    name: `system.modifiers.${dataPoint}.type`,
    value: modType,
  });
  await setItemField(page, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: `system.modifiers.${dataPoint}.value`,
    path: `system.modifiers.${dataPoint}.value`,
    value,
  });
  await closeDocSheet(page, { collection: "items", id: upgradeId });
  return upgradeId;
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
    const overrideId = await createWeaponUpgrade(page, {
      upgradeName: overrideName,
      dataPoint: "magazine",
      modType: "override",
      value: 9,
    });
    const modifierId = await createWeaponUpgrade(page, {
      upgradeName: modifierName,
      dataPoint: "magazine",
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
      const { settings } = await openOwnedItemSettings(page, {
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

      const { settings } = await openOwnedItemSettings(page, {
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

  test("an installed damage modifier upgrade adds to the posted total", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // A melee weapon with 2d6 damage; the container schema defaults already
    // accept itemUpgrade installs.
    const weaponName = uniqueName("bat");
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponName,
      data: { system: { weaponType: "lightMelee", damage: "2d6" } },
    });

    // A +2 modifier on the weapon's damage data point.
    const upgradeName = uniqueName("shockTip");
    const upgradeId = await createWeaponUpgrade(page, {
      upgradeName,
      dataPoint: "damage",
      modType: "modifier",
      value: 2,
    });

    // Embed the upgrade on the actor sheet, then install it into the weapon.
    await dragItemToActorSheet(page, {
      itemId: upgradeId,
      sheetId: weapon.sheetId,
      actorId,
    });
    const embeddedUpgradeId = await page.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.find((i) => i.name === upgradeName)?.id,
      { actorId, upgradeName },
    );
    await equipWeapon(page, {
      actorSheetId: weapon.sheetId,
      actorId,
      itemId: weapon.itemId,
    });
    await installUpgrade(page, {
      actorSheetId: weapon.sheetId,
      actorId,
      upgradeId: embeddedUpgradeId,
      targetId: weapon.itemId,
    });

    const sheet = page.locator(`#${weapon.sheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageGlyph = sheet.locator(
      `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${weapon.itemId}"]`,
    );
    await expect(damageGlyph).toBeVisible();

    await test.step("the dialog keeps the base formula and lists the upgrade mod", async () => {
      await damageGlyph.click();
      const dialog = await verifyRollDialog(page);
      // A modifier does not change the formula; it rides along as a mod.
      const header = await readDamageFormula(dialog);
      expect(header, `damage formula: ${header}`).toMatch(/:\s*2d6/);
      expectModEntry(await readTotalModsTooltip(dialog), upgradeName, "+2");
    });

    await test.step("the posted card totals the dice plus the +2 mod", async () => {
      const messagesBefore = await chatMessageCount(page);
      const dialog = await verifyRollDialog(page);
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      const messageId = await waitForNewChatMessage(page, messagesBefore, {
        requireRoll: true,
      });
      // Confirmed dialogs close with a short animation; wait for the dialog to
      // leave the DOM before reading chat.
      await expect(dialog).toHaveCount(0);

      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible();
      // The damage card shows its total in the d6 number div (the crit bonus
      // is not part of it; only the external mod is added on top).
      const total = Number(
        await card.locator(".d6-number-div span.clickable").textContent(),
      );
      const dice = await rollDiceSum(page, messageId);
      expect(total - dice, "card total minus the rolled dice").toBe(2);
    });

    // The damage roll created with no token targeted raises a warning toast.
    await dismissNotifications(page);
  });
});
