import { expect } from "@playwright/test";
import { createDocumentViaUI } from "./documents.mjs";
import { closeDocSheet, expectSheetRendered } from "./sheets.mjs";
import { openSidebarTab } from "./sidebar.mjs";

export const ITEM_TYPES = [
  "ammo",
  "armor",
  "clothing",
  "criticalInjury",
  "cyberdeck",
  "cyberware",
  "drug",
  "gear",
  "itemUpgrade",
  "netarch",
  "program",
  "role",
  "skill",
  "vehicle",
  "weapon",
];

export async function createItemViaUI(page, { type, name }) {
  return createDocumentViaUI(page, { documentTab: "items", type, name });
}

export async function reopenItemSheetViaUI(page, itemId) {
  await openSidebarTab(page, "items");
  const entry = page.locator(`#items [data-entry-id="${itemId}"]`);
  await expect(entry).toBeVisible();
  await entry.dblclick();

  await page.waitForFunction(
    (id) => game.items.get(id)?.sheet?.rendered === true,
    itemId,
    { timeout: 15000 },
  );
  const elementId = await page.evaluate((id) => {
    const sheet = game.items.get(id).sheet;
    return sheet.element?.id ?? null;
  }, itemId);

  expect(elementId).toBeTruthy();
  await expect(page.locator(`#${elementId}`)).toBeVisible();
  return elementId;
}

export async function openItemSettings(page, sheetId) {
  const sheet = page.locator(`#${sheetId}`);
  const tab = sheet.locator('a.tab-label[data-tab="item-settings"]');
  await tab.click();
  await expect(tab).toHaveClass(/active/);
  return sheet;
}

export async function setItemField(
  page,
  { sheetId, itemId, actorId = null, name, path, value },
) {
  const sheet = await openItemSettings(page, sheetId);
  const input = sheet.locator(`input[name="${name}"]`);
  await expect(input).toBeVisible();
  await input.fill(String(value));
  await input.press("Tab");
  await page.waitForFunction(
    ({ itemId, actorId, path, value }) => {
      const item = actorId
        ? game.actors.get(actorId)?.items.get(itemId)
        : game.items.get(itemId);
      return foundry.utils.getProperty(item, path) === value;
    },
    { itemId, actorId, path, value },
    { timeout: 10000 },
  );
}

export async function toggleItemCheckbox(
  page,
  { sheetId, itemId, actorId = null, target, expected },
) {
  const sheet = await openItemSettings(page, sheetId);
  const toggle = sheet.locator(`a.item-checkbox[data-target="${target}"]`);
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.waitForFunction(
    ({ itemId, actorId, target, expected }) => {
      const item = actorId
        ? game.actors.get(actorId)?.items.get(itemId)
        : game.items.get(itemId);
      return foundry.utils.getProperty(item, target) === expected;
    },
    { itemId, actorId, target, expected },
    { timeout: 10000 },
  );
}

export async function setItemSelected(page, { sheetId, itemId, name, value }) {
  const sheet = await openItemSettings(page, sheetId);
  const select = sheet.locator(`select[name="${name}"]`);
  await expect(select).toBeVisible();
  await select.selectOption(value);
  await page.waitForFunction(
    ({ itemId, name, value }) =>
      foundry.utils.getProperty(game.items.get(itemId), name) === value,
    { itemId, name, value },
    { timeout: 10000 },
  );
}

// Create a world weapon that can hold ammo (a heavyPistol, ranged, magazine of
// 8), allow ammo — and, when includeUpgrades, itemUpgrade too — as installable
// types, set its compatible ammo to its own weapon type, then close the sheet.
// Returns the weapon's id.
export async function createLoadableWeapon(
  page,
  { name, includeUpgrades = false },
) {
  const weaponType = "heavyPistol";
  const itemId = await createItemViaUI(page, { type: "weapon", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  const settings = await openItemSettings(page, sheetId);
  await settings
    .locator('select[name="system.weaponType"]')
    .selectOption(weaponType);
  await page.waitForFunction(
    ({ itemId, weaponType }) =>
      foundry.utils.getProperty(game.items.get(itemId), "system.weaponType") ===
      weaponType,
    { itemId, weaponType },
    { timeout: 10000 },
  );
  await toggleItemCheckbox(page, {
    sheetId,
    itemId,
    target: "system.isRanged",
    expected: true,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.magazine.max",
    path: "system.magazine.max",
    value: 8,
  });

  await (await openItemSettings(page, sheetId))
    .locator(".manage-installable-types")
    .click();
  const installableTypesDialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedTypes"]') });
  await installableTypesDialog
    .locator('input[name="selectedTypes"][value="ammo"]')
    .check();
  if (includeUpgrades) {
    await installableTypesDialog
      .locator('input[name="selectedTypes"][value="itemUpgrade"]')
      .check();
  }
  await installableTypesDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction(
    ({ id, includeUpgrades }) => {
      const allowed = game.items.get(id).system.installedItems.allowedTypes;
      return (
        allowed.includes("ammo") &&
        (!includeUpgrades || allowed.includes("itemUpgrade"))
      );
    },
    { id: itemId, includeUpgrades },
  );

  await (await openItemSettings(page, sheetId))
    .locator(".select-compatible-ammo")
    .click();
  const compatibleAmmoDialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedAmmo"]') });
  await compatibleAmmoDialog
    .locator(`input[name="selectedAmmo"][value="${weaponType}"]`)
    .check();
  await compatibleAmmoDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction(
    ({ id, weaponType }) =>
      game.items.get(id).system.ammoVariety.includes(weaponType),
    { id: itemId, weaponType },
  );

  await closeDocSheet(page, { collection: "items", id: itemId });
  return itemId;
}
