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
  openItemSettings,
  openOwnedItemSettings,
  openSidebarTab,
  readDamageFormula,
  readTotalModsTooltip,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
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
 *
 * It also covers upgrades that target cyberware: those expose no modifier
 * data points (their payload is an installation size plus an optional
 * secondary weapon), so installing one charges the implant's slots instead of
 * changing stats. A fresh custom cyberware accepts `itemUpgrade` installs by
 * default, so no allowed-types setup is needed.
 *
 * One current behaviour is pinned as-is: a cyberware-targeting upgrade can be
 * configured with a secondary weapon on its sheet (cyberware is treated like
 * a weapon target there), but that weapon never reaches the Fight tab — the
 * equipped-weapon list only includes secondary-weapon upgrades whose host
 * item is equipped, and cyberware has no equippable mixin.
 */

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

/**
 * Create a standalone itemUpgrade that targets cyberware. A fresh upgrade
 * defaults to targeting weapons; the type select switches it, after which the
 * sheet offers an installation size (the slot cost) instead of modifier rows.
 * With `secondaryWeapon`, also check the Is-a-secondary-weapon box and pin
 * that the attackable settings it reveals render for a cyberware target.
 */
async function createCyberwareUpgrade(
  page,
  { upgradeName, size, secondaryWeapon = false },
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
  expect(
    await page.evaluate((id) => game.items.get(id).system.type, upgradeId),
  ).toBe("weapon");
  await setItemSelected(page, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: "system.type",
    value: "cyberware",
  });
  if (secondaryWeapon) {
    await toggleItemCheckbox(page, {
      sheetId: upgradeSheetId,
      itemId: upgradeId,
      target: "system.modifiers.secondaryWeapon.configured",
      expected: true,
    });
    const settings = await openItemSettings(page, upgradeSheetId);
    await expect(
      settings.locator('select[name="system.weaponType"]'),
    ).toBeVisible();
    await expect(settings.locator('input[name="system.damage"]')).toBeVisible();
  }
  await setItemField(page, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: "system.size",
    path: "system.size",
    value: size,
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
    const ammo = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weapon.sheetId,
      itemType: "ammo",
      itemName: uniqueName("rifleAmmo"),
      data: { system: { variety: "rifle", amount: 12 } },
    });

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
      value: 4,
    });

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

    const weaponName = uniqueName("bat");
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponName,
      data: { system: { weaponType: "lightMelee", damage: "2d6" } },
    });

    const upgradeName = uniqueName("shockTip");
    const upgradeId = await createWeaponUpgrade(page, {
      upgradeName,
      dataPoint: "damage",
      modType: "modifier",
      value: 2,
    });

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
      await expect(dialog).toHaveCount(0);

      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible();
      const total = Number(
        await card.locator(".d6-number-div span.clickable").textContent(),
      );
      const dice = await rollDiceSum(page, messageId);
      expect(total - dice, "card total minus the rolled dice").toBe(2);
    });

    await dismissNotifications(page);
  });

  test("an upgrade targeting cyberware installs into the implant and consumes its slots", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    const cyberwareName = uniqueName("arm");
    const cyberware = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "cyberware",
      itemName: cyberwareName,
    });

    const upgradeName = uniqueName("servo");
    const upgradeId = await createCyberwareUpgrade(page, {
      upgradeName,
      size: 1,
    });

    await dragItemToActorSheet(page, {
      itemId: upgradeId,
      sheetId: cyberware.sheetId,
      actorId,
    });
    const embeddedUpgradeId = await page.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.find((i) => i.name === upgradeName)?.id,
      { actorId, upgradeName },
    );

    await test.step("the install dialog offers the implant as the target", async () => {
      await installUpgrade(page, {
        actorSheetId: cyberware.sheetId,
        actorId,
        upgradeId: embeddedUpgradeId,
        targetId: cyberware.itemId,
      });
    });

    await test.step("installing charges the implant's slots by the upgrade size", async () => {
      const state = await page.evaluate(
        ({ actorId, itemId, upgradeId }) => {
          const actor = game.actors.get(actorId);
          return {
            isInstalled: actor.items.get(upgradeId).system.isInstalled,
            installedIn: actor.items.get(upgradeId).system.installedIn,
            list: actor.items.get(itemId).system.installedItems.list,
            slots: actor.items.get(itemId).system.installedItems.slots,
            usedSlots: actor.items.get(itemId).system.installedItems.usedSlots,
          };
        },
        { actorId, itemId: cyberware.itemId, upgradeId: embeddedUpgradeId },
      );
      expect(state.isInstalled).toBe(true);
      expect(state.installedIn).toEqual([cyberware.itemId]);
      expect(state.list).toContain(embeddedUpgradeId);
      expect(state.slots).toBe(3);
      expect(
        state.usedSlots,
        "the upgrade's installation size is charged",
      ).toBe(1);
    });

    await test.step("the item sheet shows one fewer available slot and lists the upgrade", async () => {
      const { settings } = await openOwnedItemSettings(page, {
        actorId,
        itemId: cyberware.itemId,
        sheetId: cyberware.sheetId,
      });
      const slotsRow = settings.locator("li.item", {
        has: page.locator(".manage-installed-items"),
      });
      await expect(slotsRow).toContainText("Available Slots: 2");
      const nestedRow = settings.locator(
        `li.item[data-item-id="${embeddedUpgradeId}"][data-item-category="itemUpgrade"]`,
      );
      await expect(nestedRow).toBeVisible();
      await expect(nestedRow).toContainText(upgradeName);
      await closeOwnedItemSheet(page, { actorId, itemId: cyberware.itemId });
    });

    await test.step("a fresh gear render marks the implant as upgraded", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      const row = gearRow(page, afterSheet, cyberware.itemId);
      await expect(row.locator(".fa-square-caret-up")).toBeVisible();
    });
  });

  test("a configured secondary weapon on a cyberware-targeting upgrade never lists on the fight tab", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    const cyberwareName = uniqueName("arm");
    const cyberware = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "cyberware",
      itemName: cyberwareName,
    });

    const upgradeName = uniqueName("blade");
    const upgradeId = await createCyberwareUpgrade(page, {
      upgradeName,
      size: 1,
      secondaryWeapon: true,
    });

    await dragItemToActorSheet(page, {
      itemId: upgradeId,
      sheetId: cyberware.sheetId,
      actorId,
    });
    const embeddedUpgradeId = await page.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.find((i) => i.name === upgradeName)?.id,
      { actorId, upgradeName },
    );

    await test.step("the configured upgrade installs into the implant", async () => {
      await installUpgrade(page, {
        actorSheetId: cyberware.sheetId,
        actorId,
        upgradeId: embeddedUpgradeId,
        targetId: cyberware.itemId,
      });
    });

    // The Fight tab lists secondary-weapon upgrades only when their host item
    // is equipped (weapons-schema getWeapons("equipped")). Cyberware has no
    // equippable mixin, so its host can never reach that state — pin the
    // resulting absence rather than a string match.
    await test.step("the fight tab renders no weapon row for the upgrade", async () => {
      const sheet = page.locator(`#${cyberware.sheetId}`);
      await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
      await expect(
        sheet.locator(
          `.bottom-content-section [data-item-id="${embeddedUpgradeId}"]`,
        ),
      ).toHaveCount(0);
    });
  });
});
