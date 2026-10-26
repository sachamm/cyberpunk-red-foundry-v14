import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  createInventoryItemViaUI,
  enablePlayersCreateInventory,
  openItemSettings,
  openOwnedItemSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createCharacterViaUI,
  gearRow,
  manageUpgradesDialog,
  selectAmmoDialog,
} from "../actors/character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Installable mixin: the install-target dialog and the uninstall dialog.
 *
 * - The install glyph on an itemUpgrade row opens a modal "Select Install
 *   Target" dialog listing only compatible containers with free slots: for a
 *   weapon-type upgrade that means weapons (the container's type must match
 *   the upgrade's target type) that are not full, each row showing the
 *   target's free/total slots. Confirming installs into the chosen target —
 *   the upgrade leaves the top-level gear list and nests under its parent.
 *   With no compatible targets the dialog shows a "no options" header and no
 *   rows; canceling it changes nothing.
 * - Ammo loaded into several weapons uninstalls per container: the weapon's
 *   own item sheet lists the nested ammo with an uninstall control that opens
 *   the multi-container confirmation, every loading weapon checked by
 *   default; confirming with a subset unchecked removes the ammo from the
 *   rest only, returning its rounds to the stack.
 */

// The modal "Select Install Target" dialog (the one with the target radios).
function installTargetsDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('input[name="selectedTarget"]'),
  });
}

test.describe("Item installable mixin", () => {
  test("the install dialog lists only compatible targets with free slots", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // Weapon A has a single slot; weapon B is already full (3/3); the armor's
    // default container accepts itemUpgrades but is not a weapon, so only A
    // can take a weapon-type upgrade.
    const weaponAName = uniqueName("smg");
    const weaponBName = uniqueName("pistol");
    const armorName = uniqueName("vest");
    const weaponA = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponAName,
      data: { system: { installedItems: { slots: 1 } } },
    });
    const weaponB = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weaponA.sheetId,
      itemType: "weapon",
      itemName: weaponBName,
      data: { system: { installedItems: { usedSlots: 3 } } },
    });
    const armor = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weaponB.sheetId,
      itemType: "armor",
      itemName: armorName,
    });
    let freshSheet = armor.sheetId;

    const upgradeName = uniqueName("extendedMag");
    const upgrade = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: freshSheet,
      itemType: "itemUpgrade",
      itemName: upgradeName,
    });
    freshSheet = upgrade.sheetId;

    await test.step("the dialog offers only weapon A, with its free slot count", async () => {
      const row = gearRow(page, freshSheet, upgrade.itemId);
      await row
        .locator('a.item-action[data-action-type="install-item"]')
        .click();

      const dialog = installTargetsDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const headerText = await page.evaluate(
        ({ key, installable }) =>
          game.i18n.format(game.i18n.localize(key), { installable }),
        {
          key: "CPR.dialog.selectInstallTarget.header",
          installable: upgradeName,
        },
      );
      await expect(dialog.locator(".dialog-header .text-normal")).toHaveText(
        headerText,
      );

      const radios = dialog.locator('input[name="selectedTarget"]');
      await expect(radios).toHaveCount(1);
      await expect(radios.first()).toHaveValue(weaponA.itemId);

      // The offered row shows the target's free/total slots: 1 free of 1.
      const targetRow = dialog.locator("li.dialog-item").filter({
        has: page.locator(
          `input[name="selectedTarget"][value="${weaponA.itemId}"]`,
        ),
      });
      await expect(targetRow).toHaveCount(1);
      await expect(targetRow.first()).toContainText("1/1");

      // The full weapon and the non-weapon container are not offered.
      await expect(dialog).not.toContainText(weaponBName);
      await expect(dialog).not.toContainText(armorName);
    });

    await test.step("confirming installs into weapon A and nests the upgrade under it", async () => {
      const dialog = installTargetsDialog(page);
      await dialog
        .locator(`input[name="selectedTarget"][value="${weaponA.itemId}"]`)
        .check();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      await page.waitForFunction(
        ({ aid, wid, uid }) => {
          const w = game.actors.get(aid).items.get(wid);
          return (
            w.system.installedItems.list.includes(uid) &&
            w.system.installedItems.usedSlots === 1
          );
        },
        { aid: actorId, wid: weaponA.itemId, uid: upgrade.itemId },
        { timeout: 10000 },
      );

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      // The installed upgrade leaves the top-level gear list; its only row is
      // now nested inside weapon A's row.
      const upgradeRows = gearRow(page, freshSheet, upgrade.itemId);
      await expect(upgradeRows).toHaveCount(1);
      const nestedUnder = await upgradeRows
        .first()
        .evaluate((row) =>
          row.parentElement.closest("li")?.getAttribute("data-item-id"),
        );
      expect(
        nestedUnder,
        "the remaining upgrade row is nested under weapon A",
      ).toBe(weaponA.itemId);
      await expect(
        gearRow(page, freshSheet, weaponA.itemId).locator(
          "a.toggle-installed-visibility",
        ),
      ).toHaveCount(1);
    });

    await test.step("with every target full or incompatible the dialog offers nothing", async () => {
      // Weapon A is now full (1/1) and B was full to start with, so a size-2
      // upgrade has nowhere to go.
      const bigName = uniqueName("bigUpgrade");
      const big = await createInventoryItemViaUI(page, {
        actorId,
        sheetId: freshSheet,
        itemType: "itemUpgrade",
        itemName: bigName,
        data: { system: { size: 2 } },
      });
      freshSheet = big.sheetId;

      await gearRow(page, freshSheet, big.itemId)
        .locator('a.item-action[data-action-type="install-item"]')
        .click();

      const noOptionsText = await page.evaluate(
        ({ key, target }) =>
          game.i18n.format(game.i18n.localize(key), { target }),
        { key: "CPR.dialog.selectInstallTarget.noOptions", target: bigName },
      );
      // The no-options dialog renders no rows at all, so the radio-based
      // locator cannot match it; anchor on the header instead.
      const dialog = page.locator(".cpr-dialog").filter({
        has: page
          .locator(".dialog-header .text-normal")
          .filter({ hasText: bigName }),
      });
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.locator(".dialog-header .text-normal")).toHaveText(
        noOptionsText,
      );
      await expect(dialog.locator('input[name="selectedTarget"]')).toHaveCount(
        0,
      );

      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      // Canceling leaves the upgrade uninstalled and top-level: its row sits
      // directly in the category list, not inside any parent's sub-list.
      const bigRows = gearRow(page, freshSheet, big.itemId);
      await expect(bigRows).toHaveCount(1);
      const bigTopLevel = await bigRows
        .first()
        .evaluate((row) => row.closest(".sub-list") === null);
      expect(bigTopLevel, "the upgrade is still a top-level gear row").toBe(
        true,
      );
      await expect(
        bigRows
          .first()
          .locator('a.item-action[data-action-type="install-item"]'),
      ).toHaveCount(1);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("canceling the install dialog changes nothing", async ({ page }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // A default weapon (3 slots) and a size-1 weapon-type upgrade.
    const weaponA = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: uniqueName("smg"),
    });
    const upgrade = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weaponA.sheetId,
      itemType: "itemUpgrade",
      itemName: uniqueName("extendedMag"),
    });
    let freshSheet = upgrade.sheetId;

    await test.step("the dialog opens with the single compatible target", async () => {
      await gearRow(page, freshSheet, upgrade.itemId)
        .locator('a.item-action[data-action-type="install-item"]')
        .click();
      const dialog = installTargetsDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const radios = dialog.locator('input[name="selectedTarget"]');
      await expect(radios).toHaveCount(1);
      await expect(radios.first()).toHaveValue(weaponA.itemId);
    });

    await test.step("canceling leaves the upgrade uninstalled", async () => {
      const dialog = installTargetsDialog(page);
      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = gearRow(page, freshSheet, upgrade.itemId);
      // Still a top-level row with the (inactive) install glyph.
      await expect(row).toHaveCount(1);
      const glyph = row.locator(
        'a.item-action[data-action-type="install-item"]',
      );
      await expect(glyph).toHaveCount(1);
      await expect(glyph).not.toHaveClass(/button-active/);

      const state = await page.evaluate(
        ({ aid, wid }) => {
          const w = game.actors.get(aid).items.get(wid);
          return {
            list: w.system.installedItems.list,
            usedSlots: w.system.installedItems.usedSlots,
          };
        },
        { aid: actorId, wid: weaponA.itemId },
      );
      expect(state).toEqual({ list: [], usedSlots: 0 });
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("uninstalling ammo removes it from the selected containers only", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // Two weapons that both accept rifle ammo and upgrades, plus a stack of 12.
    const weaponAName = uniqueName("smg");
    const weaponBName = uniqueName("pistol");
    const ammoName = uniqueName("rifleAmmo");
    const weaponData = {
      system: {
        isRanged: true,
        ammoVariety: ["rifle"],
        magazine: { max: 6 },
        installedItems: { allowedTypes: ["itemUpgrade", "ammo"] },
      },
    };
    const weaponA = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponAName,
      data: weaponData,
    });
    const weaponB = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weaponA.sheetId,
      itemType: "weapon",
      itemName: weaponBName,
      data: weaponData,
    });
    const ammo = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weaponB.sheetId,
      itemType: "ammo",
      itemName: ammoName,
      data: { system: { variety: "rifle", amount: 12 } },
    });
    let freshSheet = ammo.sheetId;

    await test.step("the same stack loads into both weapons", async () => {
      for (const weapon of [weaponA, weaponB]) {
        await gearRow(page, freshSheet, weapon.itemId)
          .locator('a.item-action[data-action="select-ammo"]')
          .click();
        const dialog = selectAmmoDialog(page);
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await dialog
          .locator('select[name="selectedAmmo"]')
          .selectOption({ value: ammo.itemId });
        await dialog
          .locator('button.cpr-dialog-button[data-action="confirm"]')
          .click();
        await expect(dialog).toHaveCount(0, { timeout: 5000 });
      }

      // Ammo costs no slots (initialSize 0), so one stack serves both guns:
      // each magazine fills to 6, drawing all 12 rounds from the stack.
      await page.waitForFunction(
        ({ aid, a, b, ammoId }) => {
          const actor = game.actors.get(aid);
          return (
            actor.items.get(a).system.magazine.value === 6 &&
            actor.items.get(b).system.magazine.value === 6 &&
            actor.items.get(ammoId).system.amount === 0
          );
        },
        {
          aid: actorId,
          a: weaponA.itemId,
          b: weaponB.itemId,
          ammoId: ammo.itemId,
        },
        { timeout: 10000 },
      );
    });

    await test.step("the weapon's item sheet offers the nested ammo for uninstall", async () => {
      const row = gearRow(page, freshSheet, weaponA.itemId);
      await row.locator("a.item-edit").click();
      const itemSheetId = await openOwnedItemSheet(page, {
        actorId,
        itemId: weaponA.itemId,
      });
      const itemSheet = page.locator(`#${itemSheetId}`);
      await openItemSettings(page, itemSheetId);

      // The installed tree renders open on item sheets, with an uninstall
      // control on the nested ammo row.
      const uninstallLink = itemSheet.locator(
        `a.uninstall-single-item[data-item-id="${ammo.itemId}"]`,
      );
      await expect(uninstallLink).toHaveCount(1);
      await uninstallLink.click();

      const dialog = manageUpgradesDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const headerText = await page.evaluate(
        ({ key, installableItemName }) =>
          game.i18n.format(game.i18n.localize(key), { installableItemName }),
        {
          key: "CPR.dialog.uninstallConfirmation.message",
          installableItemName: ammoName,
        },
      );
      await expect(dialog.locator(".dialog-header .text-normal")).toHaveText(
        headerText,
      );

      // Both loading weapons are listed and checked by default.
      const checkboxA = dialog.locator(
        `input[name="selectedItems"][value="${weaponA.itemId}"]`,
      );
      const checkboxB = dialog.locator(
        `input[name="selectedItems"][value="${weaponB.itemId}"]`,
      );
      await expect(checkboxA).toBeChecked();
      await expect(checkboxB).toBeChecked();
    });

    await test.step("confirming with weapon A unchecked unloads only weapon B", async () => {
      const dialog = manageUpgradesDialog(page);
      await dialog
        .locator(`input[name="selectedItems"][value="${weaponA.itemId}"]`)
        .uncheck();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      // B's rounds return to the stack; A keeps its load and its install entry.
      await page.waitForFunction(
        ({ aid, a, b, ammoId }) => {
          const actor = game.actors.get(aid);
          const wa = actor.items.get(a);
          const wb = actor.items.get(b);
          return (
            wb.system.magazine.value === 0 &&
            actor.items.get(ammoId).system.amount === 6 &&
            wa.system.magazine.value === 6 &&
            wa.system.installedItems.list.includes(ammoId) &&
            !wb.system.installedItems.list.includes(ammoId)
          );
        },
        {
          aid: actorId,
          a: weaponA.itemId,
          b: weaponB.itemId,
          ammoId: ammo.itemId,
        },
        { timeout: 10000 },
      );

      await closeOwnedItemSheet(page, { actorId, itemId: weaponA.itemId });
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        gearRow(page, freshSheet, weaponA.itemId).locator(".gear-amount"),
      ).toHaveText("6/6");
      // With no ammo loaded, B's magazine display is empty.
      const bAmount = await gearRow(page, freshSheet, weaponB.itemId)
        .locator(".gear-amount")
        .innerText();
      expect(
        bAmount.trim(),
        "weapon B shows no magazine without loaded ammo",
      ).toBe("");
      await expect(
        gearRow(page, freshSheet, ammo.itemId).locator(
          'input[name="item.system.amount"]',
        ),
      ).toHaveValue("6");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });
});
