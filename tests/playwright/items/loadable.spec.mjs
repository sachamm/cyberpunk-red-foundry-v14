import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  closeAndReopenActorSheet,
  createInventoryItemViaUI,
  dismissNotifications,
  enablePlayersCreateInventory,
  equipWeapon,
  openSidebarTab,
  uniqueName,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";
import {
  chatRollCard,
  createCharacterViaUI,
  gearRow,
  manageUpgradesDialog,
  selectAmmoDialog,
} from "../actors/character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Loadable mixin: magazine bookkeeping at the load/unload edges.
 *
 * - Uninstalling an upgrade that increased capacity clamps the loaded rounds
 *   back to the base max and returns the overage to the loaded ammo stack
 *   (syncMagazine runs from uninstallItems while the upgrade still counts
 *   toward capacity).
 * - Firing a ranged weapon with no ammo loaded still posts the attack roll;
 *   the out-of-bullets condition surfaces as a console warning and a toast,
 *   not a block.
 */

test.describe("Item loadable mixin", () => {
  test("uninstalling a magazine upgrade returns the overage to the ammo stack", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: uniqueName("smg"),
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
    const upgrade = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: ammo.sheetId,
      itemType: "itemUpgrade",
      itemName: uniqueName("extendedMag"),
      data: {
        system: { modifiers: { magazine: { type: "modifier", value: 3 } } },
      },
    });
    let freshSheet = upgrade.sheetId;

    await test.step("installing the upgrade and reloading fills to capacity 9", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator('a[data-action-type="manage-upgrades"]').click();
      const dialog = manageUpgradesDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const checkbox = dialog.locator(
        `input[name="selectedItems"][value="${upgrade.itemId}"]`,
      );
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      await page.waitForFunction(
        ({ aid, wid, uid }) =>
          game.actors
            .get(aid)
            .items.get(wid)
            .system.installedItems.list.includes(uid),
        { aid: actorId, wid: weapon.itemId, uid: upgrade.itemId },
        { timeout: 10000 },
      );

      await gearRow(page, freshSheet, weapon.itemId)
        .locator('a.item-action[data-action="select-ammo"]')
        .click();
      const selectDialog = selectAmmoDialog(page);
      await expect(selectDialog).toBeVisible({ timeout: 5000 });
      await selectDialog
        .locator('select[name="selectedAmmo"]')
        .selectOption({ value: ammo.itemId });
      await selectDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(selectDialog).toHaveCount(0, { timeout: 5000 });

      await page.waitForFunction(
        ({ aid, wid, ammoId }) =>
          game.actors.get(aid).items.get(wid).system.magazine.value === 9 &&
          game.actors.get(aid).items.get(ammoId).system.amount === 3,
        { aid: actorId, wid: weapon.itemId, ammoId: ammo.itemId },
        { timeout: 10000 },
      );

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        gearRow(page, freshSheet, weapon.itemId).locator(".gear-amount"),
      ).toHaveText("9/9");
    });

    await test.step("uninstalling the upgrade clamps the magazine to 6 and returns the overage", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator('a[data-action-type="manage-upgrades"]').click();
      const dialog = manageUpgradesDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const checkbox = dialog.locator(
        `input[name="selectedItems"][value="${upgrade.itemId}"]`,
      );
      await expect(checkbox).toBeChecked();
      await checkbox.uncheck();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      await page.waitForFunction(
        ({ aid, wid, uid, ammoId }) => {
          const w = game.actors.get(aid).items.get(wid);
          return (
            !w.system.installedItems.list.includes(uid) &&
            w.system.magazine.value === 6 &&
            game.actors.get(aid).items.get(ammoId).system.amount === 6
          );
        },
        {
          aid: actorId,
          wid: weapon.itemId,
          uid: upgrade.itemId,
          ammoId: ammo.itemId,
        },
        { timeout: 10000 },
      );

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        gearRow(page, freshSheet, weapon.itemId).locator(".gear-amount"),
      ).toHaveText("6/6");
      await expect(
        gearRow(page, freshSheet, ammo.itemId).locator(
          'input[name="item.system.amount"]',
        ),
      ).toHaveValue("6");
    });
  });

  test("firing a ranged weapon with an empty magazine warns but still rolls", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    const weaponName = uniqueName("pistol");
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponName,
      data: {
        system: {
          isRanged: true,
          weaponType: "medPistol",
          ammoVariety: ["medPistol"],
        },
      },
    });

    await equipWeapon(page, {
      actorSheetId: weapon.sheetId,
      actorId,
      itemId: weapon.itemId,
    });

    const sheet = page.locator(`#${weapon.sheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const attackRoll = sheet.locator(
      `.bottom-content-section a.rollable[data-roll-type="attack"][data-item-id="${weapon.itemId}"]`,
    );
    await expect(attackRoll).toBeVisible();

    await test.step("the attack still posts a roll card named for the weapon", async () => {
      const messagesBefore = await chatMessageCount(page);
      await attackRoll.click({ modifiers: CTRL_CLICK_MODIFIERS });
      const messageId = await waitForNewChatMessage(page, messagesBefore, {
        requireRoll: true,
      });

      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible();
      await expect(card).toContainText(weaponName);
    });

    await test.step("the out-of-bullets warning fires in the console and as a toast", async () => {
      const needle = "you lack the bullets in your weapon";
      const localizedWarning = await page.evaluate(() =>
        game.i18n.localize("CPR.messages.weaponAttackOutOfBullets"),
      );
      expect(localizedWarning).toContain(needle);

      await expect
        .poll(() => page.consoleWarnings.some((t) => t.includes(needle)), {
          timeout: 10000,
        })
        .toBeTruthy();

      const banner = page
        .locator(".notification.warning")
        .filter({ hasText: needle });
      await expect(banner).toBeVisible();
      await dismissNotifications(page);
    });
  });
});
