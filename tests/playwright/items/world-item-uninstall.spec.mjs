import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeDocSheet,
  createLoadableWeapon,
  createUpgradeViaUI,
  openItemSettings,
  reopenItemSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * World item list container flow: installing and uninstalling upgrades on a
 * weapon that lives in the world item list (no owning actor).
 *
 * Uninstalling a magazine upgrade used to throw an uncaught TypeError from
 * syncMagazine ("actor is null"), leaving the upgrade installed. The console
 * harness fails on any uncaught exception, so this spec asserts the WI #1215
 * traceback directly while also proving the data ends up correct.
 */

test("uninstalling a magazine upgrade from a world item weapon works", async ({
  page,
}) => {
  const weaponName = uniqueName("SMG");
  const upgradeName = uniqueName("Extended Magazine");

  const weaponId = await createLoadableWeapon(page, {
    name: weaponName,
    includeUpgrades: true,
  });
  const upgradeId = await createUpgradeViaUI(page, {
    name: upgradeName,
    dataPoint: "magazine",
    modType: "modifier",
    value: 3,
  });

  let sheetId;
  // Installing into a world item stores a *copy* of the upgrade (world items
  // act as infinite stacks), so track the installed copy's id, not the
  // original's.
  let installedUpgradeId;

  await test.step("the upgrade installs from the manage-upgrades dialog", async () => {
    sheetId = await reopenItemSheetViaUI(page, weaponId);
    const settings = await openItemSettings(page, sheetId);
    await settings.locator(".manage-installed-upgrades").click();

    const dialog = page
      .locator(".application")
      .filter({ has: page.locator('input[name="selectedItems"]') });
    await dialog
      .locator(`input[name="selectedItems"][value="${upgradeId}"]`)
      .check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();

    installedUpgradeId = await page.waitForFunction(
      ({ weaponId }) => {
        const list = game.items.get(weaponId).system.installedItems.list;
        return list.length === 1 ? list[0] : null;
      },
      { weaponId },
      { timeout: 10000 },
    );
  });

  await test.step("close and reopen the sheet, mirroring the WI repro", async () => {
    await closeDocSheet(page, { collection: "items", id: weaponId });
    sheetId = await reopenItemSheetViaUI(page, weaponId);
  });

  await test.step("uninstalling the upgrade from the world item succeeds", async () => {
    const settings = await openItemSettings(page, sheetId);
    await settings.locator(".manage-installed-upgrades").click();

    const dialog = page
      .locator(".application")
      .filter({ has: page.locator('input[name="selectedItems"]') });
    const checkbox = dialog.locator(
      `input[name="selectedItems"][value="${installedUpgradeId}"]`,
    );
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();

    await page.waitForFunction(
      ({ weaponId }) => {
        const item = game.items.get(weaponId);
        return (
          item.system.installedItems.list.length === 0 &&
          item.system.magazine.value === 0
        );
      },
      { weaponId },
      { timeout: 15000 },
    );
  });

  await test.step("the manage-upgrades dialog no longer lists the upgrade as installed", async () => {
    const settings = await openItemSettings(page, sheetId);
    await settings.locator(".manage-installed-upgrades").click();

    const dialog = page
      .locator(".application")
      .filter({ has: page.locator('input[name="selectedItems"]') });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator('input[name="selectedItems"]:checked'),
    ).toHaveCount(0);
  });
});
